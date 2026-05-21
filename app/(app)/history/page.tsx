import { createClient } from "@/lib/supabase/server";
import { CLUB_LABELS, CLUBS } from "@/types";
import type { Club } from "@/types";
import { ClubAveragesSection, UNASSIGNED_KEY } from "@/components/ClubAveragesSection";
import { UnfilledShotsSection, type UnfilledShot } from "@/components/UnfilledShotsSection";

export default async function HistoryPage() {
  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // ID・日付付きで全件取得（展開表示と個別削除に使用）
  // shots テーブルから直接集計。RLS が holes→rounds.user_id 経由で所有権を強制する。
  // club が NULL のショットは「未分類」グループにまとめる（post_round 入力モードで番手後付けのケース）。
  const { data: shotRows } = await supabase
    .from("shots")
    .select(`
      id, club, distance_yards, distance_meters, created_at,
      holes!inner(rounds!inner(user_id))
    `)
    .eq("holes.rounds.user_id", user!.id)
    .not("distance_meters", "is", null)
    .order("created_at", { ascending: false });

  // クラブ別に集計しつつ個別ショットも保持。club === null は UNASSIGNED_KEY にまとめる。
  const clubMap = new Map<string, {
    totalMeters: number;
    shots: { id: string; distance_yards: number; distance_meters: number; created_at: string }[];
  }>();

  for (const shot of shotRows ?? []) {
    if (shot.distance_meters == null) continue;
    const key = shot.club ?? UNASSIGNED_KEY;
    const prev = clubMap.get(key) ?? { totalMeters: 0, shots: [] };
    clubMap.set(key, {
      totalMeters: prev.totalMeters + Number(shot.distance_meters),
      shots: [...prev.shots, {
        id: shot.id,
        distance_yards: shot.distance_yards,
        distance_meters: Number(shot.distance_meters),
        created_at: shot.created_at,
      }],
    });
  }

  // 並び順: CLUBS 配列の順（1W → 3W → … → ウェッジ）、未分類は最後。
  const clubOrder = new Map<string, number>(CLUBS.map((c, i) => [c, i]));
  const orderIndex = (club: string) =>
    club === UNASSIGNED_KEY
      ? Number.MAX_SAFE_INTEGER
      : clubOrder.get(club) ?? Number.MAX_SAFE_INTEGER - 1;

  const clubStats = Array.from(clubMap.entries())
    .map(([club, { totalMeters, shots }]) => ({
      club,
      average_distance_meters: totalMeters / shots.length,
      shot_count: shots.length,
      shots,
    }))
    .sort((a, b) => orderIndex(a.club) - orderIndex(b.club));

  const { data: recentShots } = await supabase
    .from("shots")
    .select(`
      id, club, distance_yards, created_at,
      holes(hole_number, rounds(course_name, date))
    `)
    .not("distance_yards", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  // Unfilled shots (post-round mode): club IS NULL with a round attached
  const { data: unfilledRaw } = await supabase
    .from("shots")
    .select(`
      id, shot_number, distance_yards, club, ball_shape, ball_direction,
      lie_vertical, lie_horizontal, note, hole_id, round_id,
      holes!inner(hole_number, rounds!inner(user_id, course_name, date))
    `)
    .is("club", null)
    .eq("holes.rounds.user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const unfilledShots: UnfilledShot[] = (unfilledRaw ?? []).map((row) => {
    const hole = row.holes as unknown as {
      hole_number: number;
      rounds: { course_name: string; date: string };
    };
    return {
      id: row.id,
      shot_number: row.shot_number,
      distance_yards: row.distance_yards,
      club: row.club,
      ball_shape: row.ball_shape,
      ball_direction: row.ball_direction,
      lie_vertical: row.lie_vertical,
      lie_horizontal: row.lie_horizontal,
      note: row.note,
      hole_id: row.hole_id,
      hole_number: hole.hole_number,
      round_id: row.round_id,
      round_date: hole.rounds.date,
      course_name: hole.rounds.course_name,
    };
  });

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-8">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-xl font-bold text-green-800">スタッツ</h1>
      </div>

      <ClubAveragesSection initialStats={clubStats} />

      <UnfilledShotsSection initialShots={unfilledShots} />

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
