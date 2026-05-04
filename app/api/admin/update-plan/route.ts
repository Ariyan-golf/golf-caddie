import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { generateReferralCode } from "@/lib/referral-code";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, plan } = await request.json() as { userId: string; plan: string };
  if (!userId || !plan) {
    return NextResponse.json({ error: "userId / plan は必須です" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let updates: Record<string, unknown> = { plan };

  if (plan === "premium") {
    // premium 昇格時: referral_code が未設定なら自動生成
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, referral_code")
      .eq("id", userId)
      .single();

    if (!profile?.referral_code) {
      updates.referral_code = generateReferralCode(profile?.display_name ?? "");
    }
  } else {
    // standard / free 降格時: 招待コードを無効化
    updates.referral_code = null;
  }

  const { error } = await admin.from("profiles").update(updates).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
