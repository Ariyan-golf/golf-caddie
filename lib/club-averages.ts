import type { SupabaseClient } from "@supabase/supabase-js";
import { CLUBS, type Club } from "@/types";

/**
 * 旧 club_averages テーブル（削除/再割当てで減算されず過大になる集計テーブル）を使わず、
 * 本人のクラブ別平均飛距離を都度集計する共通ヘルパー。
 *
 * 集計ソースは2系統を合算する：
 *   1. ラウンドのショット shots（club 非null・distance_meters 非null・本人分）
 *      結合・絞り込みは swing(app/(app)/swing/page.tsx) / home(app/page.tsx) と同一経路：
 *      shots -> holes -> rounds(user_id)
 *   2. 距離計測 shot_distances（本人分。club / distance_meters は NOT NULL）
 * いずれも距離は distance_meters（メートル）を使用。
 *
 * 戻り値は旧 club_averages が返していた 3 フィールド
 *   { club, average_distance_meters, shot_count }
 * と同じ形（メートル平均）。下流（advice のプロンプト生成・ai-caddie の pickClub）は
 * この形のまま無改変で動く。
 *
 * 集計対象は types/index.ts の CLUBS に含まれる番手のみ（putter や未知の値は除外）。
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
  const [shotsRes, distancesRes] = await Promise.all([
    supabase
      .from("shots")
      .select("club, distance_meters, holes!inner(rounds!inner(user_id))")
      .eq("holes.rounds.user_id", userId)
      .not("club", "is", null)
      .not("distance_meters", "is", null),
    supabase
      .from("shot_distances")
      .select("club, distance_meters")
      .eq("user_id", userId),
  ]);

  const validClubs = new Set<string>(CLUBS);
  const agg = new Map<string, { total: number; count: number }>();

  const accumulate = (rows: Array<{ club: string | null; distance_meters: number | null }>) => {
    for (const row of rows) {
      const club = row.club;
      if (club == null || !validClubs.has(club)) continue;
      if (row.distance_meters == null) continue;
      const dist = Number(row.distance_meters);
      const cur = agg.get(club) ?? { total: 0, count: 0 };
      cur.total += dist;
      cur.count += 1;
      agg.set(club, cur);
    }
  };

  accumulate((shotsRes.data ?? []) as Array<{ club: string | null; distance_meters: number | null }>);
  accumulate((distancesRes.data ?? []) as Array<{ club: string | null; distance_meters: number | null }>);

  // CLUBS の並び順で返す（任意だが下流で安定した順序になる）。
  const order = new Map<string, number>(CLUBS.map((c: Club, i) => [c, i]));
  return Array.from(agg.entries())
    .map(([club, { total, count }]) => ({
      club,
      average_distance_meters: parseFloat((total / count).toFixed(1)),
      shot_count: count,
    }))
    .sort((a, b) => (order.get(a.club) ?? 0) - (order.get(b.club) ?? 0));
}
