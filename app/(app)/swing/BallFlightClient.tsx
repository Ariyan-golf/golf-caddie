"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLUBS, CLUB_LABELS, type Club } from "@/types";

export interface ClubAverage {
  club: string;
  averageYards: number;
  shotCount: number;
}

export interface ShotEntry {
  id: string;
  holeNumber: number;
  shotNumber?: number;
  distanceYards: number | null;
  club: string | null;
  createdAt: string;
}

export interface RoundEntry {
  id: string;
  courseName: string;
  date: string;
  shots: ShotEntry[];
}

function formatDate(iso: string) {
  // round.date is "YYYY-MM-DD" — parse without timezone shift
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function BallFlightClient({
  initialAverages, initialRounds,
}: {
  initialAverages: ClubAverage[];
  initialRounds: RoundEntry[];
}) {
  const [averages, setAverages] = useState<ClubAverage[]>(initialAverages);
  const [rounds, setRounds] = useState<RoundEntry[]>(initialRounds);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    () => (initialRounds[0] ? { [initialRounds[0].id]: true } : {})
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  function recomputeAverages(nextRounds: RoundEntry[]): ClubAverage[] {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of nextRounds) {
      for (const s of r.shots) {
        if (!s.club || s.distanceYards == null) continue;
        const cur = map.get(s.club) ?? { sum: 0, count: 0 };
        cur.sum += s.distanceYards;
        cur.count += 1;
        map.set(s.club, cur);
      }
    }
    return Array.from(map.entries())
      .map(([club, { sum, count }]) => ({
        club,
        averageYards: Math.round(sum / count),
        shotCount: count,
      }))
      .sort((a, b) => b.averageYards - a.averageYards);
  }

  async function handleClubChange(shotId: string, newClub: string) {
    // Snapshot for rollback
    const prevRounds = rounds;
    const prevAverages = averages;
    const clubValue = newClub === "" ? null : newClub;

    // Optimistic UI
    const nextRounds = rounds.map((r) => ({
      ...r,
      shots: r.shots.map((s) => (s.id === shotId ? { ...s, club: clubValue } : s)),
    }));
    setRounds(nextRounds);
    setAverages(recomputeAverages(nextRounds));
    setSavingId(shotId);
    setErrorId(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("shots")
      .update({ club: clubValue, club_input_at: "事後" })
      .eq("id", shotId);

    setSavingId(null);
    if (error) {
      console.error("[ballflight] club update error:", error.message);
      setRounds(prevRounds);
      setAverages(prevAverages);
      setErrorId(shotId);
    }
  }

  function toggleRound(roundId: string) {
    setExpanded((prev) => ({ ...prev, [roundId]: !prev[roundId] }));
  }

  return (
    <div className="space-y-4">
      <ClubAveragesCard averages={averages} />
      <ShotHistoryCard
        rounds={rounds}
        expanded={expanded}
        savingId={savingId}
        errorId={errorId}
        onToggle={toggleRound}
        onClubChange={handleClubChange}
      />
    </div>
  );
}

function ClubAveragesCard({ averages }: { averages: ClubAverage[] }) {
  const maxYards = useMemo(
    () => (averages.length ? Math.max(...averages.map((a) => a.averageYards)) : 1),
    [averages]
  );

  return (
    <div className="card space-y-2">
      <h2 className="font-semibold text-green-800">クラブ別 平均飛距離</h2>
      {averages.length === 0 ? (
        <p className="text-sm text-green-400 py-4 text-center">
          クラブ設定済みのショットがありません
        </p>
      ) : (
        <div className="space-y-2">
          {averages.map((a) => {
            const label = CLUB_LABELS[a.club as Club] ?? a.club.toUpperCase();
            const pct = Math.round((a.averageYards / maxYards) * 100);
            return (
              <div key={a.club}>
                <div className="flex justify-between items-center text-sm mb-1 gap-2">
                  <span className="text-green-700 font-bold w-10 shrink-0">{label}</span>
                  <span className="text-green-600 flex-1">
                    <span className="font-bold tabular-nums">{a.averageYards}y</span>
                    <span className="text-green-400 text-xs ml-1 tabular-nums">
                      （{a.shotCount}ショット）
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
      )}
      <p className="text-xs text-green-400 pt-1">
        ※ クラブ未設定のショットは集計対象外
      </p>
    </div>
  );
}

function ShotHistoryCard({
  rounds, expanded, savingId, errorId, onToggle, onClubChange,
}: {
  rounds: RoundEntry[];
  expanded: Record<string, boolean>;
  savingId: string | null;
  errorId: string | null;
  onToggle: (roundId: string) => void;
  onClubChange: (shotId: string, club: string) => void;
}) {
  return (
    <div className="card space-y-2">
      <h2 className="font-semibold text-green-800">📋 ショット履歴</h2>
      {rounds.length === 0 ? (
        <p className="text-sm text-green-400 py-4 text-center">
          ラウンドの記録がありません
        </p>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => {
            const isOpen = !!expanded[r.id];
            const totalShots = r.shots.length;
            return (
              <div key={r.id} className="border border-green-100 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => onToggle(r.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5
                             bg-green-50 hover:bg-green-100 active:bg-green-200 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-green-700">{isOpen ? "▼" : "▶"}</span>
                    <span className="text-sm font-bold text-green-800 truncate">
                      {formatDate(r.date)} {r.courseName}
                    </span>
                  </span>
                  <span className="text-xs text-green-500 tabular-nums shrink-0">
                    {totalShots}打
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 py-2 space-y-1.5 bg-white">
                    {r.shots.length === 0 ? (
                      <p className="text-xs text-green-300 py-2 text-center">
                        ショットの記録がありません
                      </p>
                    ) : (
                      r.shots.map((s) => (
                        <ShotRow
                          key={s.id}
                          shot={s}
                          saving={savingId === s.id}
                          error={errorId === s.id}
                          onClubChange={onClubChange}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShotRow({
  shot, saving, error, onClubChange,
}: {
  shot: ShotEntry;
  saving: boolean;
  error: boolean;
  onClubChange: (shotId: string, club: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-green-700 tabular-nums w-14 shrink-0">
        H{shot.holeNumber} 第{shot.shotNumber ?? 1}打
      </span>
      <span className="text-xs text-green-600 tabular-nums w-12 shrink-0 text-right">
        {shot.distanceYards != null ? `${shot.distanceYards}y` : "—"}
      </span>
      <select
        value={shot.club ?? ""}
        onChange={(e) => onClubChange(shot.id, e.target.value)}
        disabled={saving}
        className={`flex-1 text-sm px-2 py-1.5 rounded-lg border bg-white text-green-800
                    disabled:opacity-60 ${error ? "border-red-300" : "border-green-200"}`}
      >
        <option value="">クラブを選択</option>
        {CLUBS.map((c) => (
          <option key={c} value={c}>{CLUB_LABELS[c]}</option>
        ))}
      </select>
      {saving && <span className="text-xs text-green-400 shrink-0">保存中</span>}
      {error && !saving && <span className="text-xs text-red-500 shrink-0">失敗</span>}
    </div>
  );
}
