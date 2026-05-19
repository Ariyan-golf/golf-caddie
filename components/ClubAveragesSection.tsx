"use client";

import { useState } from "react";
import { CLUB_LABELS } from "@/types";
import type { Club } from "@/types";

export const UNASSIGNED_KEY = "__unassigned__";

interface ShotRecord {
  id: string;
  distance_yards: number;
  distance_meters: number;
  created_at: string;
}

interface ClubStat {
  club: string;
  average_distance_meters: number;
  shot_count: number;
  shots: ShotRecord[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

async function deleteShot(shotId: string): Promise<boolean> {
  const res = await fetch("/api/stats/delete-shot", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shotId }),
  });
  return res.ok;
}

function ShotList({
  stat,
  onShotDeleted,
}: {
  stat: ClubStat;
  onShotDeleted: (club: string, shotId: string) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteShot(shotId: string) {
    if (!confirm("このショットデータを削除しますか？")) return;
    setDeletingId(shotId);
    try {
      const ok = await deleteShot(shotId);
      if (ok) onShotDeleted(stat.club, shotId);
    } finally {
      setDeletingId(null);
    }
  }

  if (stat.shots.length === 0) {
    return <p className="text-xs text-green-300 py-1">ショットデータなし</p>;
  }

  return (
    <>
      {stat.shots.map((shot) => (
        <div
          key={shot.id}
          className="flex items-center justify-between gap-2 py-1 border-b border-green-50 last:border-0"
        >
          <span className="text-xs text-green-400 tabular-nums w-12 shrink-0">
            {formatDate(shot.created_at)}
          </span>
          <span className="text-xs font-semibold text-green-700 flex-1 tabular-nums">
            {shot.distance_yards}y
            <span className="text-green-400 font-normal ml-1">
              ({Math.round(shot.distance_meters)}m)
            </span>
          </span>
          <button
            onClick={() => handleDeleteShot(shot.id)}
            disabled={deletingId === shot.id}
            className="shrink-0 text-xs px-2 py-0.5 rounded border border-red-200 text-red-400
                       hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
          >
            {deletingId === shot.id ? "削除中" : "削除"}
          </button>
        </div>
      ))}
    </>
  );
}

function ClubRow({
  stat,
  maxYards,
  onShotDeleted,
}: {
  stat: ClubStat;
  maxYards: number;
  onShotDeleted: (club: string, shotId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const yards = Math.round(stat.average_distance_meters * 1.09361);
  const pct = Math.round((yards / maxYards) * 100);
  const label = CLUB_LABELS[stat.club as Club] ?? stat.club;

  return (
    <div>
      {/* ── サマリー行 ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <div className="flex justify-between items-center text-sm mb-1 gap-2">
          <span className="text-green-700 font-bold w-10 shrink-0">{label}</span>
          <span className="text-green-600 flex-1">
            <span className="font-bold">{yards}y</span>
            <span className="text-green-400 text-xs ml-1">
              ({Math.round(stat.average_distance_meters)}m · {stat.shot_count}打)
            </span>
          </span>
          <span className="text-green-400 text-xs shrink-0">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
        <div className="h-2 bg-green-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {/* ── 個別ショット一覧（展開時） ── */}
      {expanded && (
        <div className="mt-2 ml-10 space-y-1 border-l-2 border-green-100 pl-3">
          <ShotList stat={stat} onShotDeleted={onShotDeleted} />
        </div>
      )}
    </div>
  );
}

function UnassignedRow({
  stat,
  onShotDeleted,
}: {
  stat: ClubStat;
  onShotDeleted: (club: string, shotId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const yards = Math.round(stat.average_distance_meters * 1.09361);

  return (
    <div className="pt-3 border-t border-green-100">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <div className="flex justify-between items-center text-sm gap-2">
          <span className="text-green-700">
            <span className="font-bold">未分類</span>
            <span className="text-green-400 text-xs ml-1">（{stat.shot_count}件）</span>
            <span className="ml-2">
              平均<span className="font-bold ml-0.5">{yards}y</span>
            </span>
          </span>
          <span className="text-green-400 text-xs shrink-0">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
        <p className="text-[11px] text-green-400 mt-1">
          ラウンド履歴から番手を後から入力できます
        </p>
      </button>

      {/* ── 個別ショット一覧（展開時） ── */}
      {expanded && (
        <div className="mt-2 ml-2 space-y-1 border-l-2 border-green-100 pl-3">
          <ShotList stat={stat} onShotDeleted={onShotDeleted} />
        </div>
      )}
    </div>
  );
}

export function ClubAveragesSection({ initialStats }: { initialStats: ClubStat[] }) {
  const [stats, setStats] = useState<ClubStat[]>(initialStats);

  // 棒グラフのスケールは番手付きショットの最大値で正規化（未分類は除外）。
  const classifiedStats = stats.filter((s) => s.club !== UNASSIGNED_KEY);
  const maxYards = classifiedStats.length
    ? Math.round(Math.max(...classifiedStats.map((s) => s.average_distance_meters)) * 1.09361)
    : 1;

  function handleShotDeleted(club: string, shotId: string) {
    setStats((prev) =>
      prev
        .map((s) => {
          if (s.club !== club) return s;
          const remaining = s.shots.filter((sh) => sh.id !== shotId);
          if (remaining.length === 0) return null;
          const totalMeters = remaining.reduce((sum, sh) => sum + sh.distance_meters, 0);
          return {
            ...s,
            shots: remaining,
            shot_count: remaining.length,
            average_distance_meters: totalMeters / remaining.length,
          };
        })
        .filter((s): s is ClubStat => s !== null)
    );
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
      <h2 className="font-semibold text-green-800 mb-1">番手別平均飛距離</h2>
      <p className="text-xs text-green-400 mb-3">番手をタップすると個別ショット一覧が開きます</p>
      <div className="space-y-3">
        {stats.map((stat) =>
          stat.club === UNASSIGNED_KEY ? (
            <UnassignedRow
              key={stat.club}
              stat={stat}
              onShotDeleted={handleShotDeleted}
            />
          ) : (
            <ClubRow
              key={stat.club}
              stat={stat}
              maxYards={maxYards}
              onShotDeleted={handleShotDeleted}
            />
          )
        )}
      </div>
    </div>
  );
}
