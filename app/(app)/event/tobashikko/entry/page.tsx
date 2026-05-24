import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TobashikkoEntryClient, type DriverShot, type EntryRow } from "./TobashikkoEntryClient";

export const dynamic = "force-dynamic";

export default async function TobashikkoEntryPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect("/login");

  // 自分のドライバーショット（club='1w' で distance_yards 非NULL）を holes/rounds 経由で取得
  const { data: shotRows } = await supabase
    .from("shots")
    .select(`
      id, distance_yards, created_at,
      holes!inner(hole_number, rounds!inner(course_name, date, user_id))
    `)
    .eq("club", "1w")
    .eq("holes.rounds.user_id", user.id)
    .not("distance_yards", "is", null)
    .order("created_at", { ascending: false });

  const driverShots: DriverShot[] = (shotRows ?? []).map((row) => {
    const hole = row.holes as unknown as {
      hole_number: number;
      rounds: { course_name: string; date: string };
    };
    return {
      id: row.id,
      distance_yards: row.distance_yards as number,
      hole_number: hole.hole_number,
      course_name: hole.rounds.course_name,
      date: hole.rounds.date,
    };
  });

  const { data: entryRows } = await supabase
    .from("tobashikko_entries")
    .select("id, shot_id, driver_brand, driver_model, shaft_brand, shaft_model, ball_brand, ball_model")
    .eq("user_id", user.id);

  const entries: EntryRow[] = (entryRows ?? []).map((e) => ({
    id:           e.id,
    shot_id:      e.shot_id,
    driver_brand: e.driver_brand ?? null,
    driver_model: e.driver_model ?? null,
    shaft_brand:  e.shaft_brand  ?? null,
    shaft_model:  e.shaft_model  ?? null,
    ball_brand:   e.ball_brand   ?? null,
    ball_model:   e.ball_model   ?? null,
  }));

  // エントリー候補から「非表示」にしたショットの shot_id 一覧。
  // shots 本体は触らない（スタッツ画面の記録を壊さないため）。
  const { data: hiddenRows } = await supabase
    .from("tobashikko_hidden_shots")
    .select("shot_id")
    .eq("user_id", user.id);
  const hiddenShotIds: string[] = (hiddenRows ?? []).map((r) => r.shot_id as string);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">飛ばしっこGO エントリー</h1>
        <p className="text-xs text-green-600 mt-2 leading-relaxed">
          自分のドライバーショットからエントリーしたい記録を選びます。使用クラブ・ボールは後から入力できます。
        </p>
      </div>

      <TobashikkoEntryClient
        driverShots={driverShots}
        entries={entries}
        hiddenShotIds={hiddenShotIds}
      />
    </div>
  );
}
