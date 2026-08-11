import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundGuest, GuestShot } from "@/types";

/**
 * 同伴者の代理飛距離測定（round_guests / guest_shots）の共通ヘルパー。
 *
 * 【設計の要】shots には一切書かない・読まない。
 *   shots は user_id 列を持たず所有者が round_id -> rounds.user_id で決まるため、
 *   同伴者のショットを shots に入れると必ず本人の記録として解釈され、
 *   lib/club-averages.ts（クラブ別平均）・app/page.tsx（ドライバー平均）・
 *   飛ばしっこGO・コンペ集計のすべてに混入する。よって代理測定は
 *   guest_shots へ完全分離し、既存の集計クエリからは構造的に見えないようにする。
 *   このファイルの関数は round_guests / guest_shots 以外のテーブルを触らない。
 *
 * 【論理削除】shots と同じく物理 DELETE はせず deleted_at に now() を立てる。
 *   取得系は必ず deleted_at IS NULL で絞る（下記 fetch 系がその責務を持つ）。
 */

export const MAX_ROUND_GUESTS = 3;

/**
 * 入力欄の値から INSERT 行を作る。
 * display_order は「入力欄の並び順」をそのまま使う（2番目の欄だけ入力された場合は 1）。
 * 空欄・空白のみは除外し、最大 MAX_ROUND_GUESTS 人まで。
 */
export function buildGuestRows(
  roundId: string,
  names: string[]
): { round_id: string; name: string; display_order: number }[] {
  return names
    .map((n, i) => ({ round_id: roundId, name: n.trim(), display_order: i }))
    .filter((r) => r.name.length > 0)
    .slice(0, MAX_ROUND_GUESTS);
}

/**
 * ラウンド開始時の同伴者一括登録。
 * 名前が1つも入っていなければ INSERT を発行せず即 return する
 * （＝同伴者0人のラウンド開始は従来と完全に同じ通信・同じ挙動になる）。
 * 失敗してもラウンド開始そのものは止めない（呼び出し側は戻り値を無視してよい）。
 */
export async function insertRoundGuests(
  supabase: SupabaseClient,
  roundId: string,
  names: string[]
): Promise<RoundGuest[]> {
  const rows = buildGuestRows(roundId, names);
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("round_guests")
    .insert(rows)
    .select("*");

  if (error) {
    console.error("[round-guests] insert failed:", error.message);
    return [];
  }
  return (data ?? []) as RoundGuest[];
}

/** ラウンド中の同伴者1人追加。display_order は既存の最大値+1。 */
export async function insertRoundGuest(
  supabase: SupabaseClient,
  roundId: string,
  name: string,
  displayOrder: number
): Promise<RoundGuest | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from("round_guests")
    .insert({ round_id: roundId, name: trimmed, display_order: displayOrder })
    .select("*")
    .single();

  if (error) {
    console.error("[round-guests] insert one failed:", error.message);
    return null;
  }
  return data as RoundGuest;
}

/** 同伴者の論理削除。その人のショットは表示側で guest_id により除外する。 */
export async function softDeleteRoundGuest(
  supabase: SupabaseClient,
  guestId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("round_guests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", guestId);

  if (error) {
    console.error("[round-guests] soft delete failed:", error.message);
    return false;
  }
  return true;
}

/** 代理測定ショット1件の論理削除。 */
export async function softDeleteGuestShot(
  supabase: SupabaseClient,
  shotId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("guest_shots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", shotId);

  if (error) {
    console.error("[guest-shots] soft delete failed:", error.message);
    return false;
  }
  return true;
}

/** 生存している同伴者のみ（display_order 昇順）。 */
export async function fetchRoundGuests(
  supabase: SupabaseClient,
  roundId: string
): Promise<RoundGuest[]> {
  const { data, error } = await supabase
    .from("round_guests")
    .select("*")
    .eq("round_id", roundId)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[round-guests] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as RoundGuest[];
}

/** 生存している代理測定ショットのみ（古い順）。 */
export async function fetchGuestShots(
  supabase: SupabaseClient,
  roundId: string
): Promise<GuestShot[]> {
  const { data, error } = await supabase
    .from("guest_shots")
    .select("*")
    .eq("round_id", roundId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[guest-shots] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as GuestShot[];
}
