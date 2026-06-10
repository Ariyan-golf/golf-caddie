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
  } catch (err) {
    // バッファ読み取り等の想定外エラー。UI は止めない。
    console.warn("[offline-sync] flush aborted", err);
  }
}
