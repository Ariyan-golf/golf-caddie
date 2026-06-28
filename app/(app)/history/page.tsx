import { createClient } from "@/lib/supabase/server";
import { CLUB_LABELS } from "@/types";
import type { Club } from "@/types";
import { getClubStats } from "@/lib/club-averages";
import { ClubAveragesSection, type UnassignedShot } from "@/components/ClubAveragesSection";

export default async function HistoryPage() {
  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // 全番手(CLUBS 24本) × 両ソース(shots / shot_distances) 合算を取得。
  // 記録ゼロの番手も含む（CLUBS順）。
  const clubStats = await getClubStats(supabase, user!.id);

  // 未分類（club=null・距離計測済み）のラウンドショット。番手別平均と同じ
  // ClubAveragesSection 内で「番手の事後選択／詳細編集／削除」ができる唯一の入口。
  // 表示に必要なホール・ラウンド情報も併せて取得する（旧 UnfilledShotsSection 相当）。
  // RLS が holes→rounds.user_id 経由で所有権を強制する。
  // 条件は club IS NULL ＋ distance_meters IS NOT NULL を維持。
  const { data: unassignedRows } = await supabase
    .from("shots")
    .select(`
      id, shot_number, distance_yards, distance_meters, created_at,
      club, ball_shape, ball_direction, lie_vertical, lie_horizontal, note,
      hole_id, round_id,
      holes!inner(hole_number, rounds!inner(user_id, course_name, date))
    `)
    .eq("holes.rounds.user_id", user!.id)
    .is("club", null)
    .not("distance_meters", "is", null)
    .order("created_at", { ascending: false });

  const unassignedShots: UnassignedShot[] = (unassignedRows ?? []).map((r) => {
    const hole = r.holes as unknown as {
      hole_number: number;
      rounds: { course_name: string; date: string };
    };
    return {
      id: r.id as string,
      shot_number: r.shot_number as number,
      distance_yards: (r.distance_yards as number | null) ?? null,
      distance_meters: Number(r.distance_meters),
      created_at: r.created_at as string,
      club: (r.club as string | null) ?? null,
      ball_shape: (r.ball_shape as string | null) ?? null,
      ball_direction: (r.ball_direction as string | null) ?? null,
      lie_vertical: (r.lie_vertical as string | null) ?? null,
      lie_horizontal: (r.lie_horizontal as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      hole_id: r.hole_id as string,
      hole_number: hole.hole_number,
      round_id: r.round_id as string,
      round_date: hole.rounds.date,
      course_name: hole.rounds.course_name,
    };
  });

  const { data: recentShots } = await supabase
    .from("shots")
    .select(`
      id, club, distance_yards, created_at,
      holes(hole_number, rounds(course_name, date))
    `)
    .not("distance_yards", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-8">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-xl font-bold text-green-800">スタッツ</h1>
      </div>

      <ClubAveragesSection initialStats={clubStats} initialUnassigned={unassignedShots} />

      {recentShots && recentShots.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-green-800 mb-3">最近のショット</h2>
          <div className="space-y-1">
            {recentShots.map((shot) => {
              const hole = shot.holes as unknown as {
                hole_number: number;
                rounds: { course_name: string; date: string };
              } | null;
              return (
                <div
                  key={shot.id}
                  className="flex justify-between items-center py-1.5 border-b border-green-50 last:border-0"
                >
                  <div>
                    <span className="text-sm font-bold text-green-800 w-8 inline-block">
                      {CLUB_LABELS[shot.club as Club] ?? shot.club}
                    </span>
                    {hole && (
                      <span className="text-xs text-green-400 ml-2">
                        {hole.rounds?.course_name} H{hole.hole_number}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-green-700 tabular-nums">
                    {shot.distance_yards}y
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
