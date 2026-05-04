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

  // 解約から30日以上経過したユーザーを対象に referral_code をクリア
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("profiles")
    .update({ referral_code: null })
    .lt("cancelled_at", cutoff)
    .not("referral_code", "is", null)
    .select("id");

  if (error) {
    console.error("[cleanup-cancelled] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updated = data?.length ?? 0;
  console.log(`[cleanup-cancelled] cleared referral_code for ${updated} users`);
  return NextResponse.json({ ok: true, updated });
}
