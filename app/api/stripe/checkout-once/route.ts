import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { golf_course?: string; payment_token?: string };
  const golfCourse = body.golf_course ?? "";
  // A1: 二重請求防止の冪等キー。フロントが「1回の支払い試行」ごとに発行するトークン。
  // 同じ試行のやり直しは同じトークン＝Stripe が新規請求を作らず同じセッションを返す。
  const paymentToken = body.payment_token ?? "";

  if (!process.env.STRIPE_ROUND_PRICE_ID) {
    console.error("STRIPE_ROUND_PRICE_ID is not set");
    return NextResponse.json({ error: "決済設定が未完了です（STRIPE_ROUND_PRICE_ID）" }, { status: 500 });
  }

  try {
    const params = {
      mode: "payment" as const,
      line_items: [{ price: process.env.STRIPE_ROUND_PRICE_ID, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { user_id: user.id, golf_course: golfCourse, type: "round_payment" },
      success_url: golfCourse
        ? `${BASE_URL}/round/new?course=${golfCourse}`
        : `${BASE_URL}/plan?golf_success=1`,
      cancel_url: `${BASE_URL}/plan?canceled=1`,
      locale: "ja" as const,
    };
    // トークンがあれば冪等キー付きで作成。無い場合（古いリクエスト互換）は従来どおり。
    const session = paymentToken
      ? await stripe.checkout.sessions.create(params, {
          idempotencyKey: `once:${user.id}:${paymentToken}`,
        })
      : await stripe.checkout.sessions.create(params);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("Stripe checkout-once error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
