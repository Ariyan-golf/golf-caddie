import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 飛ばしっこGO ランキング 1 行分の公開可能データ。
 * - 個人情報（user_id / email / 本名 等）は含めない。
 * - クライアントに渡してよいフィールドのみで構成。
 */
export interface TobashikkoRankingRow {
  rank:            number;
  nickname:        string;
  distance_yards:  number;
  distance_meters: number | null;
  driver_brand:    string | null;
  driver_model:    string | null;
  shaft_brand:     string | null;
  shaft_model:     string | null;
  ball_brand:      string | null;
  ball_model:      string | null;
  hole_number:     number;          // エントリーされたショットが打たれたホール番号
  course_name:     string;
  round_date:      string;          // YYYY-MM-DD
}

export interface TobashikkoEventWindow {
  start_date: string;   // YYYY-MM-DD
  end_date:   string;   // YYYY-MM-DD
}

/**
 * メーカーと機種を表示用に連結（"テーラーメイド Qi10LS 9.5度" 等）。
 * 片方しかなければそれだけ、両方 null なら null。
 */
export function joinBrandModel(brand: string | null, model: string | null): string | null {
  if (brand && model) return `${brand} ${model}`;
  return brand || model || null;
}

/**
 * 飛ばしっこGOのランキングを集計する。
 *
 *   1. tobashikko_entries 全件取得（driver/shaft/ball の brand/model 6項目すべて）
 *   2. 各エントリーの shots→holes→rounds を結合（hole_number / course_name / date を取得）
 *   3. rounds.date が event の start_date 〜 end_date 内のもののみ採用
 *   4. user_id ごとに最高飛距離 1 件（ひとり1記録）
 *   5. 飛距離降順で順位付け
 *   6. profiles.nickname で表示名（未設定は "ゴルファー"）
 *
 * 呼び出し元は RLS を bypass できる Service Role の SupabaseClient を渡すこと。
 * 戻り値の TobashikkoRankingRow には user_id 等の個人情報を一切含めない。
 */
export async function fetchTobashikkoRanking(
  admin: SupabaseClient,
  event: TobashikkoEventWindow
): Promise<TobashikkoRankingRow[]> {
  const { data: entryRows } = await admin
    .from("tobashikko_entries")
    .select(`
      user_id,
      driver_brand, driver_model,
      shaft_brand,  shaft_model,
      ball_brand,   ball_model,
      shots!inner(distance_yards, distance_meters, holes!inner(hole_number, rounds!inner(course_name, date)))
    `);

  interface EntryLike {
    user_id:      string;
    driver_brand: string | null;
    driver_model: string | null;
    shaft_brand:  string | null;
    shaft_model:  string | null;
    ball_brand:   string | null;
    ball_model:   string | null;
    shots: {
      distance_yards:  number | null;
      distance_meters: number | string | null;
      holes: {
        hole_number: number;
        rounds: {
          course_name: string;
          date:        string;
        };
      };
    } | null;
  }

  interface BestRow {
    user_id:         string;
    driver_brand:    string | null;
    driver_model:    string | null;
    shaft_brand:     string | null;
    shaft_model:     string | null;
    ball_brand:      string | null;
    ball_model:      string | null;
    distance_yards:  number;
    distance_meters: number | null;
    hole_number:     number;
    course_name:     string;
    round_date:      string;
  }

  const byUser = new Map<string, BestRow>();

  for (const row of (entryRows ?? []) as unknown as EntryLike[]) {
    const shot   = row.shots;
    const hole   = shot?.holes;
    const round  = hole?.rounds;
    const date   = round?.date;
    const course = round?.course_name;
    const yards  = shot?.distance_yards;
    const holeN  = hole?.hole_number;
    if (!shot || !hole || !round || !date || !course || yards == null || holeN == null) continue;
    if (date < event.start_date || date > event.end_date) continue;

    const prev = byUser.get(row.user_id);
    if (!prev || yards > prev.distance_yards) {
      byUser.set(row.user_id, {
        user_id:         row.user_id,
        driver_brand:    row.driver_brand,
        driver_model:    row.driver_model,
        shaft_brand:     row.shaft_brand,
        shaft_model:     row.shaft_model,
        ball_brand:      row.ball_brand,
        ball_model:      row.ball_model,
        distance_yards:  yards,
        distance_meters: shot.distance_meters != null ? Number(shot.distance_meters) : null,
        hole_number:     holeN,
        course_name:     course,
        round_date:      date,
      });
    }
  }

  if (byUser.size === 0) return [];

  // nickname を一括取得（user_id 配列はここで使い切り、戻り値には乗せない）
  const userIds = Array.from(byUser.keys());
  const { data: profs } = await admin
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);
  const nameMap = new Map(
    (profs ?? []).map((p: { id: string; nickname: string | null }) => [p.id, p.nickname])
  );

  return Array.from(byUser.values())
    .sort((a, b) => b.distance_yards - a.distance_yards)
    .map((row, i) => ({
      rank:            i + 1,
      nickname:        nameMap.get(row.user_id)?.trim() || "ゴルファー",
      distance_yards:  row.distance_yards,
      distance_meters: row.distance_meters,
      driver_brand:    row.driver_brand,
      driver_model:    row.driver_model,
      shaft_brand:     row.shaft_brand,
      shaft_model:     row.shaft_model,
      ball_brand:      row.ball_brand,
      ball_model:      row.ball_model,
      hole_number:     row.hole_number,
      course_name:     row.course_name,
      round_date:      row.round_date,
    }));
}
