import type { SupabaseClient } from "@supabase/supabase-js";
import { CLUBS } from "@/types";

/**
 * 旧 club_averages テーブル（削除/再割当てで減算されず過大になる集計テーブル）を使わず、
 * 本人のクラブ別飛距離を都度集計する共通ヘルパー。
 *
 * 集計ソースは2系統を合算する：
 *   1. ラウンドのショット shots（club 非null・distance_meters 非null・本人分）
 *      結合・絞り込みは swing(app/(app)/swing/page.tsx) / home(app/page.tsx) と同一経路：
 *      shots -> holes -> rounds(user_id)
 *   2. 距離計測 shot_distances（本人分。club / distance_meters は NOT NULL）
 * いずれも距離は distance_meters（メートル）を平均に使用。
 *
 * 集計対象は types/index.ts の CLUBS に含まれる番手のみ（putter や未知の値は除外）。
 */

export interface ClubShotRecord {
  id: string;
  distance_yards: number;
  distance_meters: number;
  created_at: string;
  source: "shot" | "distance";
}

export interface ClubStat {
  club: string;
  average_distance_meters: number;
  shot_count: number;
  shots: ClubShotRecord[];
}

export interface ClubAverageStat {
  club: string;
  average_distance_meters: number;
  shot_count: number;
}

/**
 * 全番手（CLUBS 全24本・CLUBS順）の統計を、個別記録つきで返す。
 * 記録ゼロの番手も配列に含める（shot_count=0・shots=[]）。
 */
export async function getClubStats(
  supabase: SupabaseClient,
  userId: string
): Promise<ClubStat[]> {
  const [shotsRes, distancesRes] = await Promise.all([
    supabase
      .from("shots")
      .select("id, club, distance_yards, distance_meters, created_at, holes!inner(rounds!inner(user_id))")
      .eq("holes.rounds.user_id", userId)
      .not("club", "is", null)
      .not("distance_meters", "is", null),
    supabase
      .from("shot_distances")
      .select("id, club, distance_yards, distance_meters, created_at")
      .eq("user_id", userId),
  ]);

  const validClubs = new Set<string>(CLUBS);
  const byClub = new Map<string, ClubShotRecord[]>();
  for (const c of CLUBS) byClub.set(c, []);

  type RawRow = {
    id: string;
    club: string | null;
    distance_yards: number | null;
    distance_meters: number | null;
    created_at: string;
  };

  const pushRecords = (rows: RawRow[], source: "shot" | "distance") => {
    for (const row of rows) {
      const club = row.club;
      if (club == null || !validClubs.has(club)) continue;
      if (row.distance_meters == null) continue;
      byClub.get(club)!.push({
        id: row.id,
        distance_yards: row.distance_yards ?? 0,
        distance_meters: Number(row.distance_meters),
        created_at: row.created_at,
        source,
      });
    }
  };

  pushRecords((shotsRes.data ?? []) as RawRow[], "shot");
  pushRecords((distancesRes.data ?? []) as RawRow[], "distance");

  // CLUBS の並び順で全番手を返す。各番手内は新しい順。
  return CLUBS.map((club) => {
    const shots = (byClub.get(club) ?? []).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const count = shots.length;
    const totalMeters = shots.reduce((s, r) => s + r.distance_meters, 0);
    return {
      club,
      average_distance_meters: count > 0 ? parseFloat((totalMeters / count).toFixed(1)) : 0,
      shot_count: count,
      shots,
    };
  });
}

/**
 * 番手別平均（旧 club_averages 互換の3フィールド）。
 * getClubStats の結果から記録のある番手のみを写して返すので、ホーム/アドバイス/AIキャディの
 * 数字は getClubStats（スタッツ画面）と必ず一致する。シグネチャ・戻り値の形は不変。
 */
export async function getClubAverages(
  supabase: SupabaseClient,
  userId: string
): Promise<ClubAverageStat[]> {
  const stats = await getClubStats(supabase, userId);
  return stats
    .filter((s) => s.shot_count > 0)
    .map(({ club, average_distance_meters, shot_count }) => ({
      club,
      average_distance_meters,
      shot_count,
    }));
}
