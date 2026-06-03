import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server"; import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function todayJST(): string {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10); }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { course_id?: string };
  const courseId = body.course_id ?? "";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, day_pass_date")
    .eq("id", user.id)
    .single();

  console.log("[checkout-day-pass] DEBUG", {
    user_id: user.id,
    profile,
    profileError: profileError?.message,
    todayJST: todayJST(),
    courseId,
  });

  if (profile?.day_pass_date === todayJST()) {
    return NextResponse.json(
      { error: "本日のラウンドは既に決済済みです" },
      { status: 409 }
    );
  }

  const isSubscriber = profile?.plan === "standard" || profile?.plan === "premium";
  const priceId = isSubscriber
    ? process.env.STRIPE_ROUND_SUB_PRICE_ID
    : process.env.STRIPE_ROUND_PRICE_ID;

  console.log("[checkout-day-pass] PRICE", {
    plan: profile?.plan,
    isSubscriber,
    priceId,
    has_sub_price_env: !!process.env.STRIPE_ROUND_SUB_PRICE_ID,
    has_normal_price_env: !!process.env.STRIPE_ROUND_PRICE_ID,
  });

  if (!priceId) {
    console.error("Stripe price ID is not set", { isSubscriber });
    return NextResponse.json({ error: "決済設定が未完了です" }, { status: 500 });
  }

  let agentUserId: string | null = null;
  if (courseId) {
    const { data: agent } = await supabase
      .from("golf_course_agents")
      .select("agent_user_id")
      .eq("course_id", courseId)
      .maybeSingle();
    agentUserId = agent?.agent_user_id ?? null;
  }

  let referrerId: string | null = null;
  const { data: referral } = await supabase
    .from("referrals")
    .select("referrer_id")
    .eq("referred_id", user.id)
    .maybeSingle();
  referrerId = referral?.referrer_id ?? null;

  const successQuery = new URLSearchParams({ session_id: "{CHECKOUT_SESSION_ID}" });
  if (courseId) successQuery.set("course_id", courseId);

  const cancelQuery = new URLSearchParams();
  if (courseId) cancelQuery.set("course_id", courseId);

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/pay/success?${successQuery.toString()}`,
      cancel_url: `${BASE_URL}/pay/cancel?${cancelQuery.toString()}`,
      client_reference_id: user.id,
      metadata: {
        user_id: user.id,
        course_id: courseId,
        kind: "day_pass",
        plan_at_purchase: profile?.plan ?? "free",
        is_subscriber: String(isSubscriber),
        referrer_id: referrerId ?? "",
        agent_user_id: agentUserId ?? "",
      },
    },
    // A1: 二重請求防止。デイパスは1日1枚なので user×JST日付で一意。
    // 同じ注文（同日同一ユーザー）の連打では Stripe が新規請求を作らず同じセッションを返す。
    { idempotencyKey: `daypass:${user.id}:${todayJST()}` }
  );

  return NextResponse.json({ url: session.url }); }
