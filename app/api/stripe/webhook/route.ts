import { stripe } from "@/lib/stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

const PLAN_MAP: Record<string, "standard" | "premium"> = {
  standard: "standard",
  premium: "premium",
};

async function updateUserPlan(userId: string, plan: "free" | "standard" | "premium") {
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await admin.from("profiles").update({ plan }).eq("id", userId);
}

export async function POST(request: Request) {
  const body = await request.text();
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
      const userId = session.metadata?.user_id ?? session.client_reference_id;
      const plan = session.metadata?.plan;
      if (userId && plan && PLAN_MAP[plan]) {
        await updateUserPlan(userId, PLAN_MAP[plan]);
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const plan = sub.metadata?.plan;
      if (userId && plan && PLAN_MAP[plan]) {
        await updateUserPlan(userId, PLAN_MAP[plan]);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await updateUserPlan(userId, "free");
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
