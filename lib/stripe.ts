import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// v4で月額330円1本に統一。premiumキーは内部識別子として温存（DB/Webhook互換のため）。
// 旧 standard プランは廃止。
export const PLANS = {
  premium: {
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    plan: "premium" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
