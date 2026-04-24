"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShotRecorder } from "./ShotRecorder";

interface Shot {
  id: string;
  shot_number: number;
  club: string;
  distance_yards?: number;
}

interface Hole {
  id: string;
  hole_number: number;
  par: number;
  score?: number;
  shots: Shot[];
}

interface HoleRecorderProps {
  roundId: string;
  initialHoles: Hole[];
}

export function HoleRecorder({ roundId, initialHoles }: HoleRecorderProps) {
  const [holes, setHoles] = useState<Hole[]>(initialHoles);
  const [activeHole, setActiveHole] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectingPar, setSelectingPar] = useState(false);

  async function addHole(par: number) {
    setSelectingPar(false);
    setCreating(true);
    const supabase = createClient();
    const nextNum = holes.length + 1;

    const { data, error } = await supabase
      .from("holes")
      .insert({ round_id: roundId, hole_number: nextNum, par })
      .select("*, shots(*)")
      .single();

    if (!error && data) {
      setHoles((prev) => [...prev, data]);
      setActiveHole(data.id);
    }
    setCreating(false);
  }

  async function updateHolePar(holeId: string, par: number) {
    const supabase = createClient();
    const { data } = await supabase
      .from("holes")
      .update({ par })
      .eq("id", holeId)
      .select("*, shots(*)")
      .single();

    if (data) {
      setHoles((prev) => prev.map((h) => (h.id === holeId ? data : h)));
    }
  }

  async function refreshHole(holeId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("holes")
      .select("*, shots(*)")
      .eq("id", holeId)
      .single();

    if (data) {
      setHoles((prev) => prev.map((h) => (h.id === holeId ? data : h)));
    }
  }

  return (
    <div className="space-y-3">
      {holes.map((hole) => (
        <div key={hole.id} className="card">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setActiveHole(activeHole === hole.id ? null : hole.id)}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {hole.hole_number}
              </div>
              <div className="text-left">
                <p className="font-medium text-green-800">ホール {hole.hole_number}</p>
                <p className="text-xs text-green-500">パー {hole.par} · {hole.shots.length}打</p>
              </div>
            </div>
            {hole.score && (
              <span className={`badge font-bold ${
                hole.score <= hole.par - 2 ? "bg-yellow-100 text-yellow-700" :
                hole.score === hole.par - 1 ? "bg-red-100 text-red-700" :
                hole.score === hole.par ? "bg-green-100 text-green-700" :
                hole.score === hole.par + 1 ? "bg-blue-100 text-blue-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {hole.score}
              </span>
            )}
          </button>

          {activeHole === hole.id && (
            <div className="mt-4 space-y-3 border-t border-green-100 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-green-600">パー:</span>
                {[3, 4, 5].map((p) => (
                  <button
                    key={p}
                    onClick={() => updateHolePar(hole.id, p)}
                    className={`w-8 h-8 rounded-full text-sm font-bold transition-colors ${
                      hole.par === p
                        ? "bg-green-600 text-white"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <ShotRecorder
                holeId={hole.id}
                roundId={roundId}
                shotNumber={hole.shots.length + 1}
                onShotRecorded={() => refreshHole(hole.id)}
              />
              {hole.shots.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-green-600">ショット記録</p>
                  {hole.shots.map((shot) => (
                    <div key={shot.id} className="flex justify-between text-sm py-1 border-b border-green-50">
                      <span className="text-green-700">第{shot.shot_number}打: {shot.club}</span>
                      <span className="text-green-500">{shot.distance_yards ? `${shot.distance_yards}y` : "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {holes.length < 18 && (
        selectingPar ? (
          <div className="card">
            <p className="text-sm font-medium text-green-700 mb-3">ホール {holes.length + 1} のパーを選択</p>
            <div className="flex gap-3">
              {[3, 4, 5].map((p) => (
                <button
                  key={p}
                  onClick={() => addHole(p)}
                  className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-lg hover:bg-green-700 transition-colors"
                >
                  パー {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSelectingPar(false)}
              className="w-full mt-2 text-xs text-green-500 hover:text-green-700"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSelectingPar(true)}
            disabled={creating}
            className="btn-secondary"
          >
            {creating ? "追加中..." : `+ ホール ${holes.length + 1} を追加`}
          </button>
        )
      )}

      {holes.length === 18 && (
        <div className="card bg-green-600 text-white text-center py-4">
          <p className="font-bold text-lg">ラウンド完了！お疲れ様でした 🎉</p>
          <p className="text-sm opacity-80 mt-1">
            合計: {holes.reduce((sum, h) => sum + (h.score ?? 0), 0)} ストローク
          </p>
        </div>
      )}
    </div>
  );
}
