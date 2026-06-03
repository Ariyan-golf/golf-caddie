import { stripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // v4: plan は "premium" のみ受け付ける（旧 "standard" は廃止）
  const body = await request.json() as { plan?: PlanKey | string };
  const plan = body.plan === "premium" ? "premium" : null;
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "無効なプランです" }, { status: 400 });
  }

  // A2: 作成前ガード。既に premium 会員ならセッションを作らず弾く（二重サブスク防止）。
  // 判定: profiles.plan カラム
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  if (profile?.plan === "premium") {
    return NextResponse.json(
      { error: "すでにプレミアム会員です" },
      { status: 409 }
    );
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { user_id: user.id, plan },
      success_url: `${BASE_URL}/plan?success=1&plan=${plan}`,
      cancel_url: `${BASE_URL}/plan?canceled=1`,
      locale: "ja",
      subscription_data: {
        metadata: { user_id: user.id, plan },
      },
    },
    // A1: 二重請求防止。サブスクは user×premium で一意。
    { idempotencyKey: `sub:${user.id}:premium` }
  );

  return NextResponse.json({ url: session.url });
}
