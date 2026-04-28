import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const PLANS = {
  standard: {
    priceId: process.env.STRIPE_STANDARD_PRICE_ID!,
    plan: "standard" as const,
  },
  premium: {
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    plan: "premium" as const,
  },
} as const;

export type PlanKey = keyof typeof PLANS;
