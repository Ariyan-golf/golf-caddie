"use client";

import { useState } from "react";
import { CLUB_LABELS } from "@/types";
import type { Club } from "@/types";

interface ClubStat {
  club: string;
  average_distance_meters: number;
  shot_count: number;
}

export function ClubAveragesSection({ initialStats }: { initialStats: ClubStat[] }) {
  const [stats, setStats] = useState<ClubStat[]>(initialStats);
  const [deleting, setDeleting] = useState<string | null>(null);

  const maxYards = stats.length
    ? Math.round(Math.max(...stats.map((s) => s.average_distance_meters)) * 1.09361)
    : 1;

  async function handleDelete(club: string) {
    const label = CLUB_LABELS[club as Club] ?? club;
    if (!confirm(`「${label}」の全データを削除しますか？\nこの操作は取り消せません。`)) return;
    setDeleting(club);
    try {
      const res = await fetch("/api/stats/delete-club", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ club }),
      });
      if (res.ok) {
        setStats((prev) => prev.filter((s) => s.club !== club));
      }
    } finally {
      setDeleting(null);
    }
  }

  if (stats.length === 0) {
    return (
      <div className="card text-center py-10">
        <p className="text-green-400">まだショットデータがありません</p>
        <p className="text-sm text-green-400 mt-1">ショットを記録すると統計が表示されます</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-green-800 mb-3">番手別平均飛距離</h2>
      <div className="space-y-3">
        {stats.map((stat) => {
          const yards = Math.round(stat.average_distance_meters * 1.09361);
          const pct = Math.round((yards / maxYards) * 100);
          const label = CLUB_LABELS[stat.club as Club] ?? stat.club;
          const isDeleting = deleting === stat.club;
          return (
            <div key={stat.club}>
              <div className="flex justify-between items-center text-sm mb-1 gap-2">
                <span className="text-green-700 font-bold w-10 shrink-0">{label}</span>
                <span className="text-green-600 flex-1">
                  <span className="font-bold">{yards}y</span>
                  <span className="text-green-400 text-xs ml-1">
                    ({Math.round(stat.average_distance_meters)}m · {stat.shot_count}打)
                  </span>
                </span>
                <button
                  onClick={() => handleDelete(stat.club)}
                  disabled={isDeleting}
                  className="shrink-0 text-xs px-2 py-0.5 rounded border border-red-200 text-red-400
                             hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  {isDeleting ? "削除中" : "削除"}
                </button>
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
  );
}
