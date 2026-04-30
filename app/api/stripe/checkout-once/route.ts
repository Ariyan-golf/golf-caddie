import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { golf_course?: string };
  const golfCourse = body.golf_course ?? "";

  if (!process.env.STRIPE_ROUND_PRICE_ID) {
    console.error("STRIPE_ROUND_PRICE_ID is not set");
    return NextResponse.json({ error: "決済設定が未完了です（STRIPE_ROUND_PRICE_ID）" }, { status: 500 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: process.env.STRIPE_ROUND_PRICE_ID, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { user_id: user.id, golf_course: golfCourse, type: "round_payment" },
      success_url: `${BASE_URL}/plan?golf_success=1`,
      cancel_url: `${BASE_URL}/plan?canceled=1`,
      locale: "ja",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    console.error("Stripe checkout-once error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
