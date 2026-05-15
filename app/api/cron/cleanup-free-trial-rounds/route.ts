/**
 * v4: 無料体験ユーザーのラウンドデータを24時間後に自動削除する。
 *
 * 削除条件:
 *  - profiles.plan = 'free'
 *  - profiles.role <> 'pro'（プロ・関係者は除外）
 *  - rounds.created_at が現在から24時間以上前
 *  - サブスク会員（premium / premium_paid）のデータは削除しない
 *
 * holes / shots / round_payments は CASCADE で連動削除される。
 * ベータモード時はスキップ（既存 cleanup-pending-rounds と同じ方針）。
 *
 * Vercel Cron から毎日 JST 1:00 (UTC 16:00) に呼ばれる。
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { isBetaMode } from "@/lib/betaMode";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isBetaMode()) {
    console.log("[cleanup-free-trial-rounds] beta mode active — skipping deletion");
    return NextResponse.json({ ok: true, skipped: "beta_mode", deleted: 0 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ① 削除対象ユーザー一覧（plan='free' かつ role<>'pro'）
  const { data: targetUsers, error: usersError } = await admin
    .from("profiles")
    .select("id")
    .eq("plan", "free")
    .neq("role", "pro");

  if (usersError) {
    console.error("[cleanup-free-trial-rounds] failed to fetch target users:", usersError.message);
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const userIds = (targetUsers ?? []).map((u) => u.id as string);
  if (userIds.length === 0) {
    console.log("[cleanup-free-trial-rounds] no target free-trial users");
    return NextResponse.json({ ok: true, target_users: 0, deleted: 0 });
  }

  // ② 24時間前カットオフ
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ③ 事前カウント（ログ用・削除前確認）
  const { count: targetCount, error: countError } = await admin
    .from("rounds")
    .select("id", { count: "exact", head: true })
    .in("user_id", userIds)
    .lt("created_at", cutoff);

  if (countError) {
    console.error("[cleanup-free-trial-rounds] count error:", countError.message);
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  console.log(
    `[cleanup-free-trial-rounds] target users: ${userIds.length}, target rounds: ${targetCount ?? 0}, cutoff: ${cutoff}`
  );

  // 削除対象が0件なら早期終了（無駄なDELETE発行を避ける）
  if ((targetCount ?? 0) === 0) {
    return NextResponse.json({
      ok: true,
      target_users: userIds.length,
      target_rounds: 0,
      deleted: 0,
    });
  }

  // ④ 削除実行
  const { data: deleted, error: deleteError } = await admin
    .from("rounds")
    .delete()
    .in("user_id", userIds)
    .lt("created_at", cutoff)
    .select("id");

  if (deleteError) {
    console.error("[cleanup-free-trial-rounds] delete error:", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const count = deleted?.length ?? 0;
  console.log(`[cleanup-free-trial-rounds] deleted ${count} free-trial rounds (cutoff: ${cutoff})`);
  return NextResponse.json({
    ok: true,
    target_users: userIds.length,
    target_rounds: targetCount ?? 0,
    deleted: count,
  });
}
