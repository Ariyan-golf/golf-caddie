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
  getAllShotUpdates,
  deleteShotUpdate,
  getAllRoundUpdates,
  deleteRoundUpdate,
  getAllShotDistances,
  deleteShotDistance,
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

    // ── shots の部分更新（番手・ライ・球筋・終点座標）を shots insert の後に ──
    // 対象 shot がオフライン作成（pending_shots）なら上の loop で先に insert 済み。
    // 0 件ヒット（shot 未同期）なら残して次回再送する。
    const shotUpdates = await getAllShotUpdates();
    for (const su of shotUpdates) {
      try {
        const payload: {
          club?: string | null;
          lie_type?: string | null;
          ball_shape?: string | null;
          end_lat?: number | null;
          end_lng?: number | null;
          distance_meters?: number | null;
          distance_yards?: number | null;
        } = {};
        if (su.club !== undefined) payload.club = su.club;
        if (su.lie_type !== undefined) payload.lie_type = su.lie_type;
        if (su.ball_shape !== undefined) payload.ball_shape = su.ball_shape;
        if (su.end_lat !== undefined) payload.end_lat = su.end_lat;
        if (su.end_lng !== undefined) payload.end_lng = su.end_lng;
        if (su.distance_meters !== undefined) payload.distance_meters = su.distance_meters;
        if (su.distance_yards !== undefined) payload.distance_yards = su.distance_yards;
        if (Object.keys(payload).length === 0) {
          await deleteShotUpdate(su.id);
          continue;
        }
        const { data, error } = await supabase
          .from("shots")
          .update(payload)
          .eq("id", su.id)
          .select("id");
        if (error || !data || data.length === 0) {
          // shot 本体が未同期だと 0 件＝後で再送するため残す。
          if (error) {
            console.warn("[offline-sync] shot update failed, keep for retry", su.id, error.message);
          }
          continue;
        }
        await deleteShotUpdate(su.id);
      } catch (err) {
        console.warn("[offline-sync] shot update threw, keep for retry", su.id, err);
      }
    }

    // ── スコア更新を最後に（ホール本体が同期済みであることを期待） ────────
    const scoreUpdates = await getAllScoreUpdates();
    const syncedRoundIds = new Set<string>();
    for (const su of scoreUpdates) {
      try {
        // undefined のフィールドは触らない。null は「明示クリア」の有効値として送る。
        const payload: { score?: number | null; putts?: number | null; penalties?: number; par?: number | null } = {};
        if (su.score !== undefined) payload.score = su.score;
        if (su.putts !== undefined) payload.putts = su.putts;
        if (su.penalties !== undefined) payload.penalties = su.penalties;
        if (su.par !== undefined) payload.par = su.par;

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

    // ── rounds の更新（ラウンド終了確定時の handicap_differential） ────────
    const roundUpdates = await getAllRoundUpdates();
    for (const ru of roundUpdates) {
      try {
        const payload: { handicap_differential?: number | null } = {};
        if (ru.handicap_differential !== undefined) payload.handicap_differential = ru.handicap_differential;
        if (Object.keys(payload).length === 0) {
          await deleteRoundUpdate(ru.round_id);
          continue;
        }
        const { error } = await supabase.from("rounds").update(payload).eq("id", ru.round_id);
        if (error) {
          console.warn("[offline-sync] round update failed, keep for retry", ru.round_id, error.message);
          continue;
        }
        await deleteRoundUpdate(ru.round_id);
      } catch (err) {
        console.warn("[offline-sync] round update threw, keep for retry", ru.round_id, err);
      }
    }

    // ── shot_distances の insert（番手別飛距離スタッツ・他テーブルと独立） ──
    // id は渡さずテーブル default に委ねる（既存のオンライン insert と同形）。
    // user_id は圏外保存時に未解決のことがあるため、ここ（オンライン）で getUser
    // により一度だけ解決して補完する。
    const shotDistances = await getAllShotDistances();
    let resolvedUserId: string | null = null;
    let userIdResolved = false;
    for (const sd of shotDistances) {
      try {
        let userId = sd.user_id ?? null;
        if (!userId) {
          if (!userIdResolved) {
            const { data } = await supabase.auth.getUser();
            resolvedUserId = data.user?.id ?? null;
            userIdResolved = true;
          }
          userId = resolvedUserId;
        }
        if (!userId) {
          // ユーザー未解決（未ログイン等）。残して次回再送。
          continue;
        }
        const { error } = await supabase.from("shot_distances").insert({
          user_id: userId,
          club: sd.club,
          distance_yards: sd.distance_yards,
          distance_meters: sd.distance_meters,
        });
        if (error) {
          console.warn("[offline-sync] shot_distance insert failed, keep for retry", sd.id, error.message);
          continue;
        }
        await deleteShotDistance(sd.id);
      } catch (err) {
        console.warn("[offline-sync] shot_distance insert threw, keep for retry", sd.id, err);
      }
    }
  } catch (err) {
    // バッファ読み取り等の想定外エラー。UI は止めない。
    console.warn("[offline-sync] flush aborted", err);
  }
}
