// オフラインバッファの flush（Stage 1）。
//
// 端末の IndexedDB に溜まった pending_holes → pending_shots の順に Supabase へ
// upsert（onConflict:"id", ignoreDuplicates:true ＝ ON CONFLICT DO NOTHING）し、
// 成功した行のみバッファから削除する。FK の都合で holes を必ず shots より先に
// 送る。部分失敗は行単位で残し（次回再送）、例外はログのみで UI は止めない。
//
// Stage 1 時点では書き込み側（HoleRecorder）が未接続のためバッファは常に空＝
// 実質 no-op。

import type { createClient } from "@/lib/supabase/client";
import {
  getAllHoles,
  getAllShots,
  deleteHole,
  deleteShot,
  getAllScoreUpdates,
  deleteScoreUpdate,
} from "@/lib/offline/db";

type SupabaseClient = ReturnType<typeof createClient>;

export async function flush(supabase: SupabaseClient): Promise<void> {
  try {
    // ── holes を先に（shots.hole_id の FK 先） ──────────────────────────
    const holes = await getAllHoles();
    for (const hole of holes) {
      try {
        const { error } = await supabase
          .from("holes")
          .upsert(hole, { onConflict: "id", ignoreDuplicates: true });
        if (error) {
          console.warn("[offline-sync] hole upsert failed, keep for retry", hole.id, error.message);
          continue; // 失敗行は残す
        }
        await deleteHole(hole.id);
      } catch (err) {
        console.warn("[offline-sync] hole upsert threw, keep for retry", hole.id, err);
      }
    }

    // ── shots を後に ───────────────────────────────────────────────────
    const shots = await getAllShots();
    for (const shot of shots) {
      try {
        const { error } = await supabase
          .from("shots")
          .upsert(shot, { onConflict: "id", ignoreDuplicates: true });
        if (error) {
          console.warn("[offline-sync] shot upsert failed, keep for retry", shot.id, error.message);
          continue; // 失敗行は残す
        }
        await deleteShot(shot.id);
      } catch (err) {
        console.warn("[offline-sync] shot upsert threw, keep for retry", shot.id, err);
      }
    }

    // ── スコア更新を最後に（ホール本体が同期済みであることを期待） ────────
    const scoreUpdates = await getAllScoreUpdates();
    const syncedRoundIds = new Set<string>();
    for (const su of scoreUpdates) {
      try {
        // undefined のフィールドは触らない。null は「明示クリア」の有効値として送る。
        const payload: { score?: number | null; putts?: number | null; penalties?: number } = {};
        if (su.score !== undefined) payload.score = su.score;
        if (su.putts !== undefined) payload.putts = su.putts;
        if (su.penalties !== undefined) payload.penalties = su.penalties;

        const { data, error } = await supabase
          .from("holes")
          .update(payload)
          .eq("id", su.hole_id)
          .select("id");
        if (error || !data || data.length === 0) {
          // ホール本体が未同期だと 0 件＝後で再送するため残す。
          if (error) {
            console.warn("[offline-sync] score update failed, keep for retry", su.hole_id, error.message);
          }
          continue;
        }
        await deleteScoreUpdate(su.hole_id);
        syncedRoundIds.add(su.round_id);
      } catch (err) {
        console.warn("[offline-sync] score update threw, keep for retry", su.hole_id, err);
      }
    }

    // ── 同期できたラウンドの total_score を再計算（best-effort） ──────────
    for (const roundId of syncedRoundIds) {
      try {
        const { data, error } = await supabase
          .from("holes")
          .select("score")
          .eq("round_id", roundId);
        if (error || !data) continue;
        const total = data.reduce((sum, h) => sum + (h.score ?? 0), 0);
        await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
      } catch (err) {
        // total_score の再計算失敗はスコア保存自体を妨げない。
        console.warn("[offline-sync] total_score recompute failed", roundId, err);
      }
    }
  } catch (err) {
    // バッファ読み取り等の想定外エラー。UI は止めない。
    console.warn("[offline-sync] flush aborted", err);
  }
}
