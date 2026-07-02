/**
 * v4: 無料体験ユーザーのラウンドデータを、プレー日から30日経過後に自動削除する。
 *
 * 削除条件:
 *  - profiles.plan = 'free'
 *  - profiles.role <> 'pro'（プロ・関係者は除外）
 *  - rounds.date（プレー日）が現在から30日以上前
 *  - サブスク会員（premium / premium_paid）のデータは削除しない
 *  - 飛ばしっこGO にエントリー済みのショットを含むラウンドは削除しない（順位記録を保護）
 *
 * rounds を物理削除すると ON DELETE CASCADE で holes / shots / round_revenue が連動削除される。
 * shots 経由で tobashikko_entries / tobashikko_hidden_shots も連鎖するが、
 * エントリー保有ラウンドは上記のとおり削除対象から除外している。
 * （round_payments は rounds を参照していないため連動削除の対象外。）
 * ベータモード時はスキップ（既存 cleanup-pending-rounds と同じ方針）。
 *
 * Vercel Cron から毎日 JST 1:00 (UTC 16:00) に呼ばれる（vercel.json に登録済み）。
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

  // ② 30日前カットオフ（基準はプレー日 rounds.date）
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ③ 削除候補ラウンドを取得（プレー日が30日より前）。以降の保護判定に id を使う。
  const { data: candidateRounds, error: candidateError } = await admin
    .from("rounds")
    .select("id")
    .in("user_id", userIds)
    .lt("date", cutoff);

  if (candidateError) {
    console.error("[cleanup-free-trial-rounds] candidate fetch error:", candidateError.message);
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  const candidateIds = (candidateRounds ?? []).map((r) => r.id as string);
  console.log(
    `[cleanup-free-trial-rounds] target users: ${userIds.length}, candidate rounds: ${candidateIds.length}, cutoff: ${cutoff}`
  );

  if (candidateIds.length === 0) {
    return NextResponse.json({
      ok: true,
      target_users: userIds.length,
      target_rounds: 0,
      protected_tobashikko: 0,
      deleted: 0,
    });
  }

  // ④ 飛ばしっこGO保護：エントリー済みショットを含むラウンドは削除対象から除外する。
  //    候補ラウンドの shots → tobashikko_entries を辿り、エントリー保有 round_id を集める。
  const { data: candidateShots, error: shotsError } = await admin
    .from("shots")
    .select("id, round_id")
    .in("round_id", candidateIds);

  if (shotsError) {
    console.error("[cleanup-free-trial-rounds] shots fetch error:", shotsError.message);
    return NextResponse.json({ error: shotsError.message }, { status: 500 });
  }

  const shotRows = (candidateShots ?? []) as Array<{ id: string; round_id: string }>;
  const shotIdToRound = new Map<string, string>(shotRows.map((s) => [s.id, s.round_id]));
  const shotIds = shotRows.map((s) => s.id);

  const protectedRoundIds = new Set<string>();
  if (shotIds.length > 0) {
    const { data: entries, error: entriesError } = await admin
      .from("tobashikko_entries")
      .select("shot_id")
      .in("shot_id", shotIds);

    if (entriesError) {
      console.error("[cleanup-free-trial-rounds] tobashikko entries fetch error:", entriesError.message);
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }

    for (const e of entries ?? []) {
      const roundId = shotIdToRound.get((e as { shot_id: string }).shot_id);
      if (roundId) protectedRoundIds.add(roundId);
    }
  }

  const deletableIds = candidateIds.filter((id) => !protectedRoundIds.has(id));
  const protectedCount = candidateIds.length - deletableIds.length;

  // 削除対象が0件なら早期終了（無駄なDELETE発行を避ける）
  if (deletableIds.length === 0) {
    console.log(
      `[cleanup-free-trial-rounds] nothing to delete (candidates: ${candidateIds.length}, protected: ${protectedCount})`
    );
    return NextResponse.json({
      ok: true,
      target_users: userIds.length,
      target_rounds: candidateIds.length,
      protected_tobashikko: protectedCount,
      deleted: 0,
    });
  }

  // ⑤ 削除実行（エントリー保有ラウンドを除外した round_id 群のみ）
  const { data: deleted, error: deleteError } = await admin
    .from("rounds")
    .delete()
    .in("id", deletableIds)
    .select("id");

  if (deleteError) {
    console.error("[cleanup-free-trial-rounds] delete error:", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const count = deleted?.length ?? 0;
  console.log(
    `[cleanup-free-trial-rounds] deleted ${count} free-trial rounds (protected: ${protectedCount}, cutoff: ${cutoff})`
  );
  return NextResponse.json({
    ok: true,
    target_users: userIds.length,
    target_rounds: candidateIds.length,
    protected_tobashikko: protectedCount,
    deleted: count,
  });
}
