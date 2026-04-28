"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StartHole, Weather, WindSpeed, WindDirection } from "@/types";
import { WEATHER_OPTIONS, WIND_SPEED_OPTIONS } from "@/types";

// Compass-rose layout: each entry is [row, col] in a 3×3 grid (0-indexed)
const WIND_DIRECTION_GRID: { dir: WindDirection; row: number; col: number }[] = [
  { dir: "北西", row: 0, col: 0 },
  { dir: "北",   row: 0, col: 1 },
  { dir: "北東", row: 0, col: 2 },
  { dir: "西",   row: 1, col: 0 },
  { dir: "東",   row: 1, col: 2 },
  { dir: "南西", row: 2, col: 0 },
  { dir: "南",   row: 2, col: 1 },
  { dir: "南東", row: 2, col: 2 },
];

function ToggleButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 px-3 rounded-xl border-2 text-sm font-bold transition-colors active:scale-95 ${
        selected
          ? "bg-green-600 border-green-600 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
      }`}
    >
      {label}
    </button>
  );
}

export function NewRoundForm() {
  const router = useRouter();
  const [courseName, setCourseName]         = useState("");
  const [date, setDate]                     = useState(new Date().toISOString().split("T")[0]);
  const [startHole, setStartHole]           = useState<StartHole>(1);
  const [weather, setWeather]               = useState<Weather | null>(null);
  const [windSpeed, setWindSpeed]           = useState<WindSpeed | null>(null);
  const [windDirection, setWindDirection]   = useState<WindDirection | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: err } = await supabase
      .from("rounds")
      .insert({
        user_id:        user!.id,
        course_name:    courseName,
        date,
        start_hole:     startHole,
        weather:        weather ?? null,
        wind_speed:     windSpeed ?? null,
        wind_direction: windDirection ?? null,
      })
      .select("id")
      .single();

    if (err) {
      setError("ラウンドの作成に失敗しました");
      setLoading(false);
      return;
    }

    router.push(`/round/${data.id}`);
  }

  // Build 3×3 compass grid cells (center cell is empty)
  const compassGrid: (WindDirection | null)[][] = Array.from({ length: 3 }, () => [null, null, null]);
  for (const { dir, row, col } of WIND_DIRECTION_GRID) {
    compassGrid[row][col] = dir;
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* コース名 */}
      <div>
        <label className="label">コース名 *</label>
        <input
          type="text"
          className="input"
          placeholder="例: 東京ゴルフクラブ"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          required
        />
      </div>

      {/* プレー日 */}
      <div>
        <label className="label">プレー日</label>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* スタートホール */}
      <div>
        <label className="label">スタートホール *</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <button
            type="button"
            onClick={() => setStartHole(1)}
            className={`py-3 rounded-xl border-2 font-bold text-sm transition-colors active:scale-95 ${
              startHole === 1
                ? "bg-green-600 border-green-600 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
            }`}
          >
            アウト<span className="block text-xs font-normal opacity-80">1番スタート</span>
          </button>
          <button
            type="button"
            onClick={() => setStartHole(10)}
            className={`py-3 rounded-xl border-2 font-bold text-sm transition-colors active:scale-95 ${
              startHole === 10
                ? "bg-green-600 border-green-600 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
            }`}
          >
            イン<span className="block text-xs font-normal opacity-80">10番スタート</span>
          </button>
        </div>
      </div>

      {/* 天気 */}
      <div>
        <label className="label">天気</label>
        <div className="grid grid-cols-4 gap-2 mt-1">
          {WEATHER_OPTIONS.map((w) => (
            <ToggleButton
              key={w}
              label={w}
              selected={weather === w}
              onClick={() => setWeather(weather === w ? null : w)}
            />
          ))}
        </div>
      </div>

      {/* 風速 */}
      <div>
        <label className="label">風速</label>
        <div className="grid grid-cols-4 gap-2 mt-1">
          {WIND_SPEED_OPTIONS.map((ws) => (
            <ToggleButton
              key={ws}
              label={ws}
              selected={windSpeed === ws}
              onClick={() => setWindSpeed(windSpeed === ws ? null : ws)}
            />
          ))}
        </div>
      </div>

      {/* 風向き (コンパスローズ) */}
      <div>
        <label className="label">風向き</label>
        <div className="mt-1 grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
          {compassGrid.flatMap((row, ri) =>
            row.map((dir, ci) =>
              dir ? (
                <ToggleButton
                  key={dir}
                  label={dir}
                  selected={windDirection === dir}
                  onClick={() => setWindDirection(windDirection === dir ? null : dir)}
                />
              ) : (
                <div key={`empty-${ri}-${ci}`} />
              )
            )
          )}
        </div>
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={loading || !courseName}
      >
        {loading ? "作成中..." : "ラウンドを開始する"}
      </button>
    </form>
  );
}
