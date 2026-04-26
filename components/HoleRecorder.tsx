"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShotRecorder } from "./ShotRecorder";
import type { Club, LieType } from "@/types";
import { CLUB_LABELS, LIE_TYPES, LIE_LABELS, LIE_SHORT } from "@/types";

// ── Local types ─────────────────────────────────────────────────────

interface Shot {
  id: string;
  shot_number: number;
  club: string | null;
  distance_yards: number | null;
  lie_type: string | null;
  ball_direction: string | null;
  start_lat: number | null;
  start_lng: number | null;
}

interface Hole {
  id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  shots: Shot[];
}

interface HoleRecorderProps {
  roundId: string;
  initialHoles: Hole[];
}

type Phase = "par_select" | "shooting" | "putt_select";

// ── Helpers ──────────────────────────────────────────────────────────

const WOOD_CLUBS:  Club[] = ["1w", "3w", "5w", "7w", "9w"];
const UTIL_CLUBS:  Club[] = ["u2", "u3", "u4", "u5", "u6", "u7"];
const IRON_CLUBS:  Club[] = ["2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i"];
const WEDGE_CLUBS: Club[] = ["pw", "aw", "gw", "sw", "lw"];

const BALL_DIRECTION_OPTIONS = ["hook", "draw", "straight", "fade", "slice"] as const;
const BALL_DIRECTION_LABELS: Record<string, string> = {
  hook: "フック", draw: "ドロー", straight: "ストレート", fade: "フェード", slice: "スライス",
};
const BALL_DIRECTION_SHORT: Record<string, string> = {
  hook: "フック", draw: "ドロー", straight: "ST", fade: "フェード", slice: "スライス",
};

function scoreLabel(score: number, par: number) {
  const d = score - par;
  if (d <= -2) return { text: `${score} (イーグル)`, cls: "bg-yellow-100 text-yellow-700" };
  if (d === -1) return { text: `${score} (バーディ)`, cls: "bg-red-100 text-red-600" };
  if (d === 0)  return { text: `${score} (パー)`,     cls: "bg-green-100 text-green-700" };
  if (d === 1)  return { text: `${score} (ボギー)`,   cls: "bg-blue-100 text-blue-600" };
  if (d === 2)  return { text: `${score} (ダブル)`,   cls: "bg-purple-100 text-purple-600" };
  return { text: `${score} (+${d})`, cls: "bg-gray-100 text-gray-600" };
}

// ── Main component ──────────────────────────────────────────────────

export function HoleRecorder({ roundId, initialHoles }: HoleRecorderProps) {
  const lastHole = initialHoles.at(-1);
  const initPhase: Phase =
    initialHoles.length === 0          ? "par_select" :
    lastHole?.score !== null           ? "par_select" :
                                         "shooting";

  const [holes, setHoles]           = useState<Hole[]>(initialHoles);
  const [phase, setPhase]           = useState<Phase>(initPhase);
  const [creating, setCreating]     = useState(false);
  const [expandedHole, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; type: "club" | "lie" | "direction" } | null>(null);

  const currentHole    = phase !== "par_select" ? holes.at(-1) ?? null : null;
  const completedHoles = holes.filter((h) => h.score !== null);
  const totalScore     = completedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
  const totalPar       = completedHoles.reduce((s, h) => s + h.par, 0);
  const isRoundDone    = holes.length === 18 && holes.every((h) => h.score !== null);

  // ── Actions ─────────────────────────────────────────────────────────

  async function startHole(par: number) {
    setCreating(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("holes")
      .insert({ round_id: roundId, hole_number: holes.length + 1, par })
      .select("*, shots(*)")
      .single();
    if (!error && data) {
      setHoles((prev) => [...prev, data as Hole]);
      setPhase("shooting");
    }
    setCreating(false);
  }

  async function refreshCurrent() {
    if (!currentHole) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("holes").select("*, shots(*)").eq("id", currentHole.id).single();
    if (data) {
      setHoles((prev) => prev.map((h) => (h.id === (data as Hole).id ? (data as Hole) : h)));
    }
  }

  async function completeHole(putts: number) {
    if (!currentHole) return;
    const score = currentHole.shots.length + putts;
    const supabase = createClient();
    await supabase.from("holes").update({ score, putts }).eq("id", currentHole.id);
    const updated = holes.map((h) => h.id === currentHole.id ? { ...h, score, putts } : h);
    setHoles(updated);
    const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
    await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
    setPhase("par_select");
  }

  async function updateClub(shotId: string, club: Club) {
    const supabase = createClient();
    await supabase.from("shots").update({ club }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, club } : s),
    })));
    setEditing(null);
  }

  async function updateLie(shotId: string, lie: LieType) {
    const supabase = createClient();
    await supabase.from("shots").update({ lie_type: lie }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, lie_type: lie } : s),
    })));
    setEditing(null);
  }

  async function updateBallDirection(shotId: string, dir: string) {
    const supabase = createClient();
    await supabase.from("shots").update({ ball_direction: dir }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, ball_direction: dir } : s),
    })));
    setEditing(null);
  }

  function toggleEdit(id: string, type: "club" | "lie" | "direction") {
    setEditing((prev) =>
      prev?.id === id && prev.type === type ? null : { id, type }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (isRoundDone) {
    return <RoundComplete holes={holes} totalScore={totalScore} totalPar={totalPar} />;
  }

  return (
    <div className="space-y-3">
      {completedHoles.length > 0 && (
        <div className="flex items-center justify-between bg-green-700 text-white rounded-xl px-4 py-2">
          <span className="text-sm font-medium">{completedHoles.length}H 終了</span>
          <span className="text-lg font-bold tabular-nums">
            {totalScore}
            <span className="text-sm font-normal ml-1 opacity-80">
              ({totalScore - totalPar >= 0 ? "+" : ""}{totalScore - totalPar})
            </span>
          </span>
        </div>
      )}

      {completedHoles.map((hole) => (
        <CompletedHoleCard
          key={hole.id}
          hole={hole}
          expanded={expandedHole === hole.id}
          editing={editing}
          onToggle={() => setExpanded(expandedHole === hole.id ? null : hole.id)}
          onToggleEdit={toggleEdit}
          onUpdateClub={updateClub}
          onUpdateLie={updateLie}
          onUpdateBallDirection={updateBallDirection}
        />
      ))}

      {phase === "par_select" && holes.length < 18 && (
        <ParSelector holeNumber={holes.length + 1} onCreate={startHole} creating={creating} />
      )}

      {phase === "shooting" && currentHole && (
        <ActiveHoleCard
          hole={currentHole}
          roundId={roundId}
          onShotRecorded={refreshCurrent}
          onHoleout={() => setPhase("putt_select")}
          editing={editing}
          onToggleEdit={toggleEdit}
          onUpdateClub={updateClub}
          onUpdateLie={updateLie}
          onUpdateBallDirection={updateBallDirection}
        />
      )}

      {phase === "putt_select" && currentHole && (
        <PuttSelector
          shotCount={currentHole.shots.length}
          par={currentHole.par}
          onSelect={completeHole}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function ParSelector({
  holeNumber, onCreate, creating,
}: {
  holeNumber: number;
  onCreate: (par: number) => void;
  creating: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm font-bold text-green-700 mb-3 text-center">
        ホール {holeNumber} — パーを選択
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[3, 4, 5].map((p) => (
          <button key={p} onClick={() => onCreate(p)} disabled={creating}
            className="py-5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       text-white font-bold text-2xl transition-colors disabled:opacity-50">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveHoleCard({
  hole, roundId, onShotRecorded, onHoleout,
  editing, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallDirection,
}: {
  hole: Hole;
  roundId: string;
  onShotRecorded: () => void;
  onHoleout: () => void;
  editing: { id: string; type: "club" | "lie" | "direction" } | null;
  onToggleEdit: (id: string, type: "club" | "lie" | "direction") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: LieType) => void;
  onUpdateBallDirection: (id: string, dir: string) => void;
}) {
  const lastShot = hole.shots.at(-1);
  const prevShot =
    lastShot?.start_lat != null && lastShot?.start_lng != null
      ? { id: lastShot.id, start_lat: lastShot.start_lat, start_lng: lastShot.start_lng }
      : null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center
                          text-white font-bold text-base">
            {hole.hole_number}
          </div>
          <div>
            <p className="font-bold text-green-900">ホール {hole.hole_number}</p>
            <p className="text-xs text-green-500">パー{hole.par} · {hole.shots.length}打記録済</p>
          </div>
        </div>
        <button onClick={onHoleout}
          className="bg-green-600 hover:bg-green-700 text-white font-bold
                     px-4 py-2 rounded-xl text-sm transition-colors">
          ホールアウト
        </button>
      </div>

      <ShotRecorder
        holeId={hole.id}
        roundId={roundId}
        shotNumber={hole.shots.length + 1}
        prevShot={prevShot}
        onShotRecorded={onShotRecorded}
      />

      {hole.shots.length > 0 && (
        <ShotList
          shots={hole.shots}
          editing={editing}
          onToggleEdit={onToggleEdit}
          onUpdateClub={onUpdateClub}
          onUpdateLie={onUpdateLie}
          onUpdateBallDirection={onUpdateBallDirection}
        />
      )}
    </div>
  );
}

function PuttSelector({
  shotCount, par, onSelect,
}: {
  shotCount: number;
  par: number;
  onSelect: (putts: number) => void;
}) {
  return (
    <div className="card space-y-4">
      <div className="text-center">
        <p className="text-lg font-bold text-green-800">パット数は？</p>
        <p className="text-sm text-green-500">ショット {shotCount}打 + パット</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((putts) => {
          const total = shotCount + putts;
          const diff = total - par;
          const label =
            diff <= -2 ? "イーグル" : diff === -1 ? "バーディ" :
            diff === 0 ? "パー"     : diff === 1  ? "ボギー"   :
            diff === 2 ? "ダブル"   : `+${diff}`;
          const color =
            diff <= -1 ? "border-red-400 bg-red-50 text-red-700" :
            diff === 0  ? "border-green-500 bg-green-50 text-green-700" :
            diff === 1  ? "border-blue-400 bg-blue-50 text-blue-700" :
            "border-gray-300 bg-gray-50 text-gray-700";
          return (
            <button key={putts} onClick={() => onSelect(putts)}
              className={`flex flex-col items-center py-3 rounded-2xl border-2 font-bold
                          transition-all active:scale-95 ${color}`}>
              <span className="text-2xl">{putts}</span>
              <span className="text-xs mt-0.5 font-medium">{label}</span>
              <span className="text-xs font-bold">{total}打</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompletedHoleCard({
  hole, expanded, editing, onToggle, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallDirection,
}: {
  hole: Hole;
  expanded: boolean;
  editing: { id: string; type: "club" | "lie" | "direction" } | null;
  onToggle: () => void;
  onToggleEdit: (id: string, type: "club" | "lie" | "direction") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: LieType) => void;
  onUpdateBallDirection: (id: string, dir: string) => void;
}) {
  const { text, cls } = scoreLabel(hole.score!, hole.par);
  return (
    <div className="card">
      <button className="w-full flex items-center justify-between" onClick={onToggle}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center
                          text-green-700 font-bold text-xs">
            {hole.hole_number}
          </div>
          <span className="text-sm text-green-600 font-medium">
            Par{hole.par} · {hole.shots.length}打+{hole.putts}P
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{text}</span>
          <span className="text-green-300 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && hole.shots.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-50">
          <ShotList
            shots={hole.shots}
            editing={editing}
            onToggleEdit={onToggleEdit}
            onUpdateClub={onUpdateClub}
            onUpdateLie={onUpdateLie}
            onUpdateBallDirection={onUpdateBallDirection}
          />
        </div>
      )}
    </div>
  );
}

// ── ShotList: club + lie + ball direction editing inline ─────────────

function ShotList({
  shots, editing, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallDirection,
}: {
  shots: Shot[];
  editing: { id: string; type: "club" | "lie" | "direction" } | null;
  onToggleEdit: (id: string, type: "club" | "lie" | "direction") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: LieType) => void;
  onUpdateBallDirection: (id: string, dir: string) => void;
}) {
  return (
    <div className="space-y-1">
      {shots.map((shot) => {
        const clubOpen = editing?.id === shot.id && editing.type === "club";
        const lieOpen  = editing?.id === shot.id && editing.type === "lie";
        const dirOpen  = editing?.id === shot.id && editing.type === "direction";
        const clubLabel = shot.club
          ? (CLUB_LABELS[shot.club as Club] ?? shot.club)
          : null;

        return (
          <div key={shot.id} className="border-b border-green-50 last:border-0">
            {/* Row */}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm font-medium text-green-700">
                第{shot.shot_number}打
              </span>
              <div className="flex items-center gap-1.5">
                {shot.distance_yards && (
                  <span className="text-xs font-semibold text-green-600 tabular-nums">
                    {shot.distance_yards}y
                  </span>
                )}
                {/* Club button */}
                <button
                  onClick={() => onToggleEdit(shot.id, "club")}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                    clubLabel
                      ? clubOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-600 border-green-600 text-white"
                      : clubOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {clubLabel ?? "番手"}
                </button>
                {/* Lie button */}
                <button
                  onClick={() => onToggleEdit(shot.id, "lie")}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                    shot.lie_type
                      ? lieOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-100 border-green-300 text-green-700"
                      : lieOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {shot.lie_type ? LIE_SHORT[shot.lie_type as LieType] : "ライ"}
                </button>
                {/* Ball direction button */}
                <button
                  onClick={() => onToggleEdit(shot.id, "direction")}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-bold transition-colors ${
                    shot.ball_direction
                      ? dirOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-100 border-green-300 text-green-700"
                      : dirOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {shot.ball_direction ? BALL_DIRECTION_SHORT[shot.ball_direction] : "球筋"}
                </button>
              </div>
            </div>

            {/* Club picker */}
            {clubOpen && (
              <div className="pb-2 space-y-1">
                {[WOOD_CLUBS, UTIL_CLUBS, IRON_CLUBS, WEDGE_CLUBS].map((row, i) => (
                  <div
                    key={i}
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                  >
                    {row.map((c) => (
                      <button key={c} onClick={() => onUpdateClub(shot.id, c)}
                        className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                          shot.club === c
                            ? "bg-green-600 border-green-600 text-white"
                            : "bg-white border-green-200 text-green-800 hover:bg-green-50"
                        }`}>
                        {CLUB_LABELS[c]}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Lie picker */}
            {lieOpen && (
              <div className="grid grid-cols-4 gap-1 pb-2">
                {LIE_TYPES.map((lie) => (
                  <button key={lie} onClick={() => onUpdateLie(shot.id, lie)}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                      shot.lie_type === lie
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-white border-green-200 text-green-700 hover:bg-green-50"
                    }`}>
                    {LIE_LABELS[lie]}
                  </button>
                ))}
              </div>
            )}

            {/* Ball direction picker */}
            {dirOpen && (
              <div className="grid grid-cols-5 gap-1 pb-2">
                {BALL_DIRECTION_OPTIONS.map((dir) => (
                  <button key={dir} onClick={() => onUpdateBallDirection(shot.id, dir)}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                      shot.ball_direction === dir
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-white border-green-200 text-green-700 hover:bg-green-50"
                    }`}>
                    {BALL_DIRECTION_LABELS[dir]}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Round complete ──────────────────────────────────────────────────

function RoundComplete({
  holes, totalScore, totalPar,
}: {
  holes: Hole[];
  totalScore: number;
  totalPar: number;
}) {
  const diff = totalScore - totalPar;
  const out = holes.slice(0, 9).reduce((s, h) => s + (h.score ?? 0), 0);
  const inn = holes.slice(9).reduce((s, h)  => s + (h.score ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-green-600 text-white rounded-2xl p-5 text-center">
        <p className="text-sm opacity-80">ラウンド完了</p>
        <p className="text-6xl font-bold tabular-nums mt-1">{totalScore}</p>
        <p className="text-lg opacity-90">
          {diff === 0 ? "イーブン" : diff > 0 ? `+${diff}` : `${diff}`}
        </p>
        {holes.length === 18 && (
          <p className="text-sm opacity-70 mt-2">OUT {out} / IN {inn}</p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-green-500 text-xs border-b border-green-100">
              <th className="text-left py-1">H</th>
              <th className="text-center py-1">Par</th>
              <th className="text-center py-1">打</th>
              <th className="text-center py-1">P</th>
              <th className="text-right py-1">計</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((hole) => {
              const d = (hole.score ?? 0) - hole.par;
              const color =
                d <= -2 ? "text-yellow-600" :
                d === -1 ? "text-red-500" :
                d === 0  ? "text-green-600" :
                d === 1  ? "text-blue-500" : "text-gray-500";
              return (
                <tr key={hole.id} className="border-b border-green-50">
                  <td className="py-1 text-green-700 font-medium">{hole.hole_number}</td>
                  <td className="py-1 text-center text-green-500">{hole.par}</td>
                  <td className="py-1 text-center text-green-700">{hole.shots.length}</td>
                  <td className="py-1 text-center text-green-500">{hole.putts ?? "—"}</td>
                  <td className={`py-1 text-right font-bold ${color}`}>{hole.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
