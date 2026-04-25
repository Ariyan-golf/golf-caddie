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
  club: string;
  distance_yards: number | null;
  lie_type: string | null;
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

function scoreLabel(score: number, par: number) {
  const d = score - par;
  if (d <= -2) return { text: `${score} (イーグル)`, cls: "bg-yellow-100 text-yellow-700" };
  if (d === -1) return { text: `${score} (バーディ)`, cls: "bg-red-100 text-red-600" };
  if (d === 0)  return { text: `${score} (パー)`,    cls: "bg-green-100 text-green-700" };
  if (d === 1)  return { text: `${score} (ボギー)`,  cls: "bg-blue-100 text-blue-600" };
  if (d === 2)  return { text: `${score} (ダブル)`,  cls: "bg-purple-100 text-purple-600" };
  return { text: `${score} (+${d})`, cls: "bg-gray-100 text-gray-600" };
}

// ── Main component ──────────────────────────────────────────────────

export function HoleRecorder({ roundId, initialHoles }: HoleRecorderProps) {
  const lastHole = initialHoles.at(-1);
  const initPhase: Phase =
    initialHoles.length === 0
      ? "par_select"
      : lastHole?.score !== null
      ? "par_select"
      : "shooting";

  const [holes, setHoles] = useState<Hole[]>(initialHoles);
  const [phase, setPhase] = useState<Phase>(initPhase);
  const [creating, setCreating] = useState(false);
  const [expandedHole, setExpandedHole] = useState<string | null>(null);
  const [editingLie, setEditingLie] = useState<string | null>(null);

  const currentHole = phase !== "par_select" ? holes.at(-1) ?? null : null;
  const completedHoles = holes.filter((h) => h.score !== null);
  const totalScore = completedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
  const totalPar = completedHoles.reduce((s, h) => s + h.par, 0);
  const isRoundDone = holes.length === 18 && holes.every((h) => h.score !== null);

  // ── Actions ────────────────────────────────────────────────────────

  async function startHole(par: number) {
    setCreating(true);
    const supabase = createClient();
    const nextNum = holes.length + 1;

    const { data, error } = await supabase
      .from("holes")
      .insert({ round_id: roundId, hole_number: nextNum, par })
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
      .from("holes")
      .select("*, shots(*)")
      .eq("id", currentHole.id)
      .single();
    if (data) {
      setHoles((prev) => prev.map((h) => (h.id === data.id ? (data as Hole) : h)));
    }
  }

  async function completeHole(putts: number) {
    if (!currentHole) return;
    const score = currentHole.shots.length + putts;
    const supabase = createClient();

    await supabase
      .from("holes")
      .update({ score, putts })
      .eq("id", currentHole.id);

    const updatedHoles = holes.map((h) =>
      h.id === currentHole.id ? { ...h, score, putts } : h
    );
    setHoles(updatedHoles);

    const total = updatedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
    await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);

    setPhase(holes.length === 18 ? "par_select" : "par_select");
  }

  async function updateLie(shotId: string, lie: LieType) {
    const supabase = createClient();
    await supabase.from("shots").update({ lie_type: lie }).eq("id", shotId);
    setHoles((prev) =>
      prev.map((h) => ({
        ...h,
        shots: h.shots.map((s) => (s.id === shotId ? { ...s, lie_type: lie } : s)),
      }))
    );
    setEditingLie(null);
  }

  // ── Render ─────────────────────────────────────────────────────────

  if (isRoundDone) {
    return <RoundComplete holes={holes} totalScore={totalScore} totalPar={totalPar} />;
  }

  return (
    <div className="space-y-3">
      {/* Running score strip */}
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

      {/* Completed holes (collapsible) */}
      {completedHoles.map((hole) => (
        <CompletedHoleCard
          key={hole.id}
          hole={hole}
          expanded={expandedHole === hole.id}
          editingLie={editingLie}
          onToggle={() => setExpandedHole(expandedHole === hole.id ? null : hole.id)}
          onEditLie={setEditingLie}
          onUpdateLie={updateLie}
        />
      ))}

      {/* Active area */}
      {phase === "par_select" && holes.length < 18 && (
        <ParSelector
          holeNumber={holes.length + 1}
          onCreate={startHole}
          creating={creating}
        />
      )}

      {phase === "shooting" && currentHole && (
        <ActiveHoleCard
          hole={currentHole}
          roundId={roundId}
          onShotRecorded={refreshCurrent}
          onHoleout={() => setPhase("putt_select")}
          editingLie={editingLie}
          onEditLie={setEditingLie}
          onUpdateLie={updateLie}
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
          <button
            key={p}
            onClick={() => onCreate(p)}
            disabled={creating}
            className="py-5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       text-white font-bold text-2xl transition-colors disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveHoleCard({
  hole, roundId, onShotRecorded, onHoleout, editingLie, onEditLie, onUpdateLie,
}: {
  hole: Hole;
  roundId: string;
  onShotRecorded: () => void;
  onHoleout: () => void;
  editingLie: string | null;
  onEditLie: (id: string | null) => void;
  onUpdateLie: (id: string, lie: LieType) => void;
}) {
  return (
    <div className="card space-y-4">
      {/* Hole header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center
                          text-white font-bold text-base">
            {hole.hole_number}
          </div>
          <div>
            <p className="font-bold text-green-900">ホール {hole.hole_number}</p>
            <p className="text-xs text-green-500">パー{hole.par} · {hole.shots.length}打目</p>
          </div>
        </div>
        <button
          onClick={onHoleout}
          className="bg-green-600 hover:bg-green-700 text-white font-bold
                     px-4 py-2 rounded-xl text-sm transition-colors"
        >
          ホールアウト
        </button>
      </div>

      {/* Shot recorder */}
      <ShotRecorder
        holeId={hole.id}
        roundId={roundId}
        shotNumber={hole.shots.length + 1}
        onShotRecorded={onShotRecorded}
      />

      {/* Shots so far with lie edit */}
      {hole.shots.length > 0 && (
        <ShotList
          shots={hole.shots}
          editingLie={editingLie}
          onEditLie={onEditLie}
          onUpdateLie={onUpdateLie}
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

      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((putts) => {
          const total = shotCount + putts;
          const diff = total - par;
          const label =
            diff <= -2 ? "イーグル" :
            diff === -1 ? "バーディ" :
            diff === 0  ? "パー"    :
            diff === 1  ? "ボギー"  :
            diff === 2  ? "ダブル"  : `+${diff}`;
          const color =
            diff <= -1 ? "border-red-400 bg-red-50 text-red-700" :
            diff === 0  ? "border-green-500 bg-green-50 text-green-700" :
            diff === 1  ? "border-blue-400 bg-blue-50 text-blue-700" :
            "border-gray-300 bg-gray-50 text-gray-700";

          return (
            <button
              key={putts}
              onClick={() => onSelect(putts)}
              className={`flex flex-col items-center py-4 rounded-2xl border-2 font-bold
                          transition-all active:scale-95 ${color}`}
            >
              <span className="text-3xl">{putts}</span>
              <span className="text-xs mt-1 font-medium">{label}</span>
              <span className="text-sm font-bold">{total}打</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompletedHoleCard({
  hole, expanded, editingLie, onToggle, onEditLie, onUpdateLie,
}: {
  hole: Hole;
  expanded: boolean;
  editingLie: string | null;
  onToggle: () => void;
  onEditLie: (id: string | null) => void;
  onUpdateLie: (id: string, lie: LieType) => void;
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
          <p className="text-xs font-semibold text-green-500 mb-2">ライを入力（後からでもOK）</p>
          <ShotList
            shots={hole.shots}
            editingLie={editingLie}
            onEditLie={onEditLie}
            onUpdateLie={onUpdateLie}
          />
        </div>
      )}
    </div>
  );
}

function ShotList({
  shots, editingLie, onEditLie, onUpdateLie,
}: {
  shots: Shot[];
  editingLie: string | null;
  onEditLie: (id: string | null) => void;
  onUpdateLie: (id: string, lie: LieType) => void;
}) {
  return (
    <div className="space-y-1">
      {shots.map((shot) => (
        <div key={shot.id}>
          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-green-700 font-medium">
              第{shot.shot_number}打
              <span className="ml-1.5 text-green-900 font-bold">
                {CLUB_LABELS[shot.club as Club] ?? shot.club}
              </span>
            </span>
            <div className="flex items-center gap-2">
              {shot.distance_yards && (
                <span className="text-green-600 font-semibold tabular-nums">
                  {shot.distance_yards}y
                </span>
              )}
              <button
                onClick={() => onEditLie(editingLie === shot.id ? null : shot.id)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  shot.lie_type
                    ? "bg-green-100 border-green-300 text-green-700 font-bold"
                    : "bg-gray-50 border-gray-200 text-gray-400"
                }`}
              >
                {shot.lie_type ? LIE_SHORT[shot.lie_type as LieType] : "ライ"}
              </button>
            </div>
          </div>

          {editingLie === shot.id && (
            <div className="grid grid-cols-4 gap-1.5 pb-2">
              {LIE_TYPES.map((lie) => (
                <button
                  key={lie}
                  onClick={() => onUpdateLie(shot.id, lie)}
                  className={`py-2 rounded-lg text-xs font-bold border transition-colors ${
                    shot.lie_type === lie
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-white border-green-200 text-green-700 hover:bg-green-50"
                  }`}
                >
                  {LIE_LABELS[lie]}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function RoundComplete({
  holes, totalScore, totalPar,
}: {
  holes: Hole[];
  totalScore: number;
  totalPar: number;
}) {
  const diff = totalScore - totalPar;
  const out = holes.slice(0, 9).reduce((s, h) => s + (h.score ?? 0), 0);
  const inn = holes.slice(9).reduce((s, h) => s + (h.score ?? 0), 0);

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

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-green-500 text-xs border-b border-green-100">
              <th className="text-left py-1">H</th>
              <th className="text-center py-1">Par</th>
              <th className="text-center py-1">打数</th>
              <th className="text-center py-1">パット</th>
              <th className="text-right py-1">スコア</th>
            </tr>
          </thead>
          <tbody>
            {holes.map((hole) => {
              const d = (hole.score ?? 0) - hole.par;
              const color =
                d <= -2 ? "text-yellow-600" :
                d === -1 ? "text-red-500" :
                d === 0  ? "text-green-600" :
                d === 1  ? "text-blue-500" :
                "text-gray-500";
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
