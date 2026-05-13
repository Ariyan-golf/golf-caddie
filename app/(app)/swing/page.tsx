import { createClient } from "@/lib/supabase/server";
import { BallFlightClient, type RoundEntry, type ClubAverage } from "./BallFlightClient";

export const dynamic = "force-dynamic";

const RECENT_ROUNDS_LIMIT = 3;

export default async function BallFlightPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ── Club averages: shots with club + distance_yards set ─────────────
  const { data: clubRows } = await supabase
    .from("shots")
    .select("club, distance_yards, holes!inner(rounds!inner(user_id))")
    .not("club", "is", null)
    .not("distance_yards", "is", null)
    .eq("holes.rounds.user_id", user!.id);

  const aggMap = new Map<string, { sum: number; count: number }>();
  for (const row of (clubRows ?? []) as Array<{ club: string; distance_yards: number }>) {
    const cur = aggMap.get(row.club) ?? { sum: 0, count: 0 };
    cur.sum += Number(row.distance_yards);
    cur.count += 1;
    aggMap.set(row.club, cur);
  }
  const clubAverages: ClubAverage[] = Array.from(aggMap.entries())
    .map(([club, { sum, count }]) => ({
      club,
      averageYards: Math.round(sum / count),
      shotCount: count,
    }))
    .sort((a, b) => b.averageYards - a.averageYards);

  // ── Recent rounds with shots (latest first) ─────────────────────────
  const { data: roundRows } = await supabase
    .from("rounds")
    .select("id, course_name, date, created_at")
    .eq("user_id", user!.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(RECENT_ROUNDS_LIMIT);

  const roundIds = (roundRows ?? []).map((r) => r.id);

  const { data: shotRows } = roundIds.length === 0
    ? { data: [] as Array<{
        id: string;
        round_id: string;
        club: string | null;
        distance_yards: number | null;
        created_at: string;
        holes: { hole_number: number } | null;
      }> }
    : await supabase
        .from("shots")
        .select("id, round_id, club, distance_yards, created_at, holes!inner(hole_number)")
        .in("round_id", roundIds)
        .order("created_at", { ascending: true });

  const shotsByRound = new Map<string, RoundEntry["shots"]>();
  for (const row of (shotRows ?? []) as Array<{
    id: string;
    round_id: string;
    club: string | null;
    distance_yards: number | null;
    created_at: string;
    holes: { hole_number: number } | { hole_number: number }[] | null;
  }>) {
    const hole = Array.isArray(row.holes) ? row.holes[0] : row.holes;
    const list = shotsByRound.get(row.round_id) ?? [];
    list.push({
      id: row.id,
      holeNumber: hole?.hole_number ?? 0,
      distanceYards: row.distance_yards,
      club: row.club,
      createdAt: row.created_at,
    });
    shotsByRound.set(row.round_id, list);
  }

  // Assign per-hole shot numbers (created_at ASC inside each hole)
  for (const [, shots] of shotsByRound) {
    const perHoleIdx = new Map<number, number>();
    shots.sort((a, b) => {
      if (a.holeNumber !== b.holeNumber) return a.holeNumber - b.holeNumber;
      return a.createdAt.localeCompare(b.createdAt);
    });
    for (const s of shots) {
      const n = (perHoleIdx.get(s.holeNumber) ?? 0) + 1;
      perHoleIdx.set(s.holeNumber, n);
      s.shotNumber = n;
    }
  }

  const rounds: RoundEntry[] = (roundRows ?? []).map((r) => ({
    id: r.id,
    courseName: r.course_name,
    date: r.date,
    shots: shotsByRound.get(r.id) ?? [],
  }));

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-8">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">📊 球筋</h1>
        <p className="text-sm text-green-600 mt-1">クラブ別の飛距離とショット履歴</p>
      </div>

      <BallFlightClient initialAverages={clubAverages} initialRounds={rounds} />
    </div>
  );
}
