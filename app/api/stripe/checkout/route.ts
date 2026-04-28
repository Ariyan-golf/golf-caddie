import { stripe, PLANS, type PlanKey } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await request.json() as { plan: PlanKey };
  if (!PLANS[plan]) {
    return NextResponse.json({ error: "無効なプランです" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
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
  });

  return NextResponse.json({ url: session.url });
}
