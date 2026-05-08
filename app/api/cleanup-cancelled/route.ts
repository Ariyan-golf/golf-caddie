/**
 * 解約から30日経過したユーザーの referral_code を無効化する
 * Vercel Cron から毎日呼ばれる（Authorization: Bearer <CRON_SECRET>）
 *
 * ⑤ フリープランで referral_code が残っているユーザーをクリーンアップする SQL:
 *
 * -- 事前確認（実行しない）
 * SELECT id, display_name, plan, referral_code
 * FROM public.profiles
 * WHERE plan = 'free'
 *   AND referral_code IS NOT NULL;
 *
 * -- 実際の更新（実行する場合は Supabase SQL Editor で手動実行）
 * UPDATE public.profiles
 * SET referral_code = NULL
 * WHERE plan = 'free'
 *   AND referral_code IS NOT NULL;
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { todayJST } from "@/lib/day-pass";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与する
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ─── ① 解約から30日以上経過したユーザーの referral_code をクリア ───
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: referralCleared, error: referralError } = await admin
    .from("profiles")
    .update({ referral_code: null })
    .lt("cancelled_at", cutoff)
    .not("referral_code", "is", null)
    .select("id");

  if (referralError) {
    console.error("[cleanup-cancelled] referral error:", referralError.message);
    return NextResponse.json({ error: referralError.message }, { status: 500 });
  }

  // ─── ② day_pass_date が昨日以前のユーザーは day_pass を解除 ───
  const today = todayJST();
  const { data: dayPassCleared, error: dayPassError } = await admin
    .from("profiles")
    .update({ day_pass_date: null })
    .lt("day_pass_date", today)
    .select("id");

  if (dayPassError) {
    console.error("[cleanup-cancelled] day_pass error:", dayPassError.message);
    return NextResponse.json({ error: dayPassError.message }, { status: 500 });
  }

  const referralUpdated = referralCleared?.length ?? 0;
  const dayPassUpdated  = dayPassCleared?.length  ?? 0;
  console.log(
    `[cleanup-cancelled] referral_code: ${referralUpdated} users, day_pass: ${dayPassUpdated} users`
  );
  return NextResponse.json({
    ok: true,
    referral_cleared: referralUpdated,
    day_pass_cleared: dayPassUpdated,
  });
}
