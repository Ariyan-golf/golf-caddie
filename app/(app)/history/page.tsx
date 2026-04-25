import { createClient } from "@/lib/supabase/server";
import { CLUB_LABELS } from "@/types";
import type { Club } from "@/types";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: clubAverages } = await supabase
    .from("club_averages")
    .select("club, average_distance_meters, shot_count")
    .eq("user_id", user!.id)
    .order("average_distance_meters", { ascending: false });

  const { data: recentShots } = await supabase
    .from("shots")
    .select(`
      id, club, distance_yards, created_at,
      holes(hole_number, rounds(course_name, date))
    `)
    .not("distance_yards", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);

  const maxYards = clubAverages?.length
    ? Math.round(Math.max(...clubAverages.map((s) => s.average_distance_meters)) * 1.09361)
    : 1;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-8">
      <div className="pt-4">
        <h1 className="text-xl font-bold text-green-800">番手別平均飛距離</h1>
      </div>

      {clubAverages && clubAverages.length > 0 ? (
        <div className="card">
          <div className="space-y-3">
            {clubAverages.map((stat) => {
              const yards = Math.round(stat.average_distance_meters * 1.09361);
              const pct = Math.round((yards / maxYards) * 100);
              const label = CLUB_LABELS[stat.club as Club] ?? stat.club;
              return (
                <div key={stat.club}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-green-700 font-bold w-10">{label}</span>
                    <span className="text-green-600">
                      <span className="font-bold">{yards}y</span>
                      <span className="text-green-400 text-xs ml-1">
                        ({Math.round(stat.average_distance_meters)}m · {stat.shot_count}打)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-green-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card text-center py-10">
          <p className="text-green-400">まだショットデータがありません</p>
          <p className="text-sm text-green-400 mt-1">ラウンドを記録すると統計が表示されます</p>
        </div>
      )}

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
