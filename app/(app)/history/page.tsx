import { createClient } from "@/lib/supabase/server";
import { CLUB_LABELS } from "@/types";
import type { Club } from "@/types";
import { ClubAveragesSection } from "@/components/ClubAveragesSection";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ID・日付付きで全件取得（展開表示と個別削除に使用）
  const { data: shotRows } = await supabase
    .from("shot_distances")
    .select("id, club, distance_yards, distance_meters, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  // クラブ別に集計しつつ個別ショットも保持
  const clubMap = new Map<string, {
    totalMeters: number;
    shots: { id: string; distance_yards: number; distance_meters: number; created_at: string }[];
  }>();

  for (const shot of shotRows ?? []) {
    const prev = clubMap.get(shot.club) ?? { totalMeters: 0, shots: [] };
    clubMap.set(shot.club, {
      totalMeters: prev.totalMeters + Number(shot.distance_meters),
      shots: [...prev.shots, {
        id: shot.id,
        distance_yards: shot.distance_yards,
        distance_meters: Number(shot.distance_meters),
        created_at: shot.created_at,
      }],
    });
  }

  const clubStats = Array.from(clubMap.entries())
    .map(([club, { totalMeters, shots }]) => ({
      club,
      average_distance_meters: totalMeters / shots.length,
      shot_count: shots.length,
      shots,
    }))
    .sort((a, b) => b.average_distance_meters - a.average_distance_meters);

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
        <h1 className="text-xl font-bold text-green-800">スタッツ</h1>
      </div>

      <ClubAveragesSection initialStats={clubStats} />

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
