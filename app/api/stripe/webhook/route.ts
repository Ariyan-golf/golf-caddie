import { stripe } from "@/lib/stripe";
import { generateReferralCode } from "@/lib/referral-code";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

const PLAN_MAP: Record<string, "standard" | "premium"> = {
  standard: "standard",
  premium:  "premium",
};

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * プラン変更と同時に referral_code を管理する
 * - premium 昇格時: referral_code が未設定なら自動生成
 * - standard / free 降格時: referral_code を null にクリア
 */
async function updateUserPlan(userId: string, plan: "free" | "standard" | "premium") {
  const db = adminClient();

  if (plan === "premium") {
    const { data: profile } = await db
      .from("profiles")
      .select("display_name, referral_code")
      .eq("id", userId)
      .single();

    const updates: Record<string, unknown> = { plan };
    if (!profile?.referral_code) {
      updates.referral_code = generateReferralCode(profile?.display_name ?? "");
    }
    await db.from("profiles").update(updates).eq("id", userId);
  } else {
    // standard / free への変更時は招待コードを無効化
    await db.from("profiles").update({ plan, referral_code: null }).eq("id", userId);
  }
}

async function recordRoundPayment(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  if (!userId) return;
  await adminClient().from("round_payments").insert({
    user_id:          userId,
    amount:           330,
    golf_course:      session.metadata?.golf_course ?? null,
    stripe_session_id: session.id,
  });
}

export async function POST(request: Request) {
  const body      = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.type === "round_payment") {
        await recordRoundPayment(session);
      } else {
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        const plan   = session.metadata?.plan;
        if (userId && plan && PLAN_MAP[plan]) {
          await updateUserPlan(userId, PLAN_MAP[plan]);
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub    = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const plan   = sub.metadata?.plan;
      if (userId && plan && PLAN_MAP[plan]) {
        await updateUserPlan(userId, PLAN_MAP[plan]);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub    = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await updateUserPlan(userId, "free");
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
