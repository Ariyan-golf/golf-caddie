import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 旧 club_averages テーブル（削除/再割当てで減算されず過大になる集計テーブル）を使わず、
 * 生 shots から本人のクラブ別平均飛距離を都度集計する共通ヘルパー。
 *
 * 戻り値は旧 club_averages が返していた 3 フィールド
 *   { club, average_distance_meters, shot_count }
 * と同じ形（距離は内部前提に合わせてメートル平均）。下流（advice のプロンプト生成・
 * ai-caddie の pickClub）はこの形のまま無改変で動く。
 *
 * 結合・絞り込みは swing(app/(app)/swing/page.tsx) / home(app/page.tsx) と同一経路：
 *   shots -> holes -> rounds(user_id)
 */
export interface ClubAverageStat {
  club: string;
  average_distance_meters: number;
  shot_count: number;
}

export async function getClubAverages(
  supabase: SupabaseClient,
  userId: string
): Promise<ClubAverageStat[]> {
  const { data } = await supabase
    .from("shots")
    .select("club, distance_meters, holes!inner(rounds!inner(user_id))")
    .eq("holes.rounds.user_id", userId)
    .not("club", "is", null)
    .not("distance_meters", "is", null);

  const agg = new Map<string, { total: number; count: number }>();
  for (const row of (data ?? []) as Array<{ club: string; distance_meters: number }>) {
    const club = row.club;
    const dist = Number(row.distance_meters);
    const cur = agg.get(club) ?? { total: 0, count: 0 };
    cur.total += dist;
    cur.count += 1;
    agg.set(club, cur);
  }

  return Array.from(agg.entries()).map(([club, { total, count }]) => ({
    club,
    average_distance_meters: parseFloat((total / count).toFixed(1)),
    shot_count: count,
  }));
}
