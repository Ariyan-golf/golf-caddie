import { createClient } from "@/lib/supabase/server";
import { CLUB_LABELS } from "@/types";
import type { Club } from "@/types";
import { ClubAveragesSection } from "@/components/ClubAveragesSection";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: shotRows } = await supabase
    .from("shot_distances")
    .select("club, distance_yards, distance_meters")
    .eq("user_id", user!.id);

  const clubMap = new Map<string, { totalMeters: number; count: number }>();
  for (const shot of shotRows ?? []) {
    const prev = clubMap.get(shot.club) ?? { totalMeters: 0, count: 0 };
    clubMap.set(shot.club, {
      totalMeters: prev.totalMeters + Number(shot.distance_meters),
      count: prev.count + 1,
    });
  }
  const clubAverages = Array.from(clubMap.entries())
    .map(([club, { totalMeters, count }]) => ({
      club,
      average_distance_meters: totalMeters / count,
      shot_count: count,
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

      <ClubAveragesSection initialStats={clubAverages} />

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
