"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLUBS, CLUB_LABELS, type Club } from "@/types";

const BALL_SHAPE_OPTIONS = [
  "フック", "ドロー", "ストレート", "フェード", "スライス", "トップ", "チョロ",
] as const;
const BALL_DIRECTION_OPTIONS = ["左", "真っ直ぐ", "右"] as const;
const LIE_VERTICAL_OPTIONS  = ["フラット", "左足上がり", "左足下り"] as const;
const LIE_HORIZONTAL_OPTIONS = ["フラット", "爪先上がり", "爪先下がり"] as const;

export interface UnfilledShot {
  id: string;
  shot_number: number;
  distance_yards: number | null;
  club: string | null;
  ball_shape: string | null;
  ball_direction: string | null;
  lie_vertical: string | null;
  lie_horizontal: string | null;
  note: string | null;
  hole_id: string;
  hole_number: number;
  round_id: string;
  round_date: string;
  course_name: string;
}

type DraftMap = Record<string, Partial<UnfilledShot>>;

export function UnfilledShotsSection({ initialShots }: { initialShots: UnfilledShot[] }) {
  const [shots, setShots] = useState<UnfilledShot[]>(initialShots);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (shots.length === 0) {
    return null;
  }

  // Group by round → hole
  const grouped = new Map<string, { date: string; course: string; holes: Map<number, UnfilledShot[]> }>();
  for (const s of shots) {
    const r = grouped.get(s.round_id) ?? { date: s.round_date, course: s.course_name, holes: new Map() };
    const list = r.holes.get(s.hole_number) ?? [];
    list.push(s);
    r.holes.set(s.hole_number, list);
    grouped.set(s.round_id, r);
  }

  function setDraft(id: string, patch: Partial<UnfilledShot>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(shot: UnfilledShot) {
    const draft = drafts[shot.id] ?? {};
    setSavingId(shot.id);
    const supabase = createClient();
    const payload = {
      club: draft.club ?? shot.club,
      ball_shape: draft.ball_shape ?? shot.ball_shape,
      ball_direction: draft.ball_direction ?? shot.ball_direction,
      lie_vertical: draft.lie_vertical ?? shot.lie_vertical,
      lie_horizontal: draft.lie_horizontal ?? shot.lie_horizontal,
      note: draft.note ?? shot.note,
    };
    const { error } = await supabase.from("shots").update(payload).eq("id", shot.id);
    setSavingId(null);
    if (error) {
      console.error("[unfilled-shots] save error:", error.message);
      return;
    }
    // Drop the row from the unfilled list once a club is set
    if (payload.club) {
      setShots((prev) => prev.filter((x) => x.id !== shot.id));
      setDrafts((prev) => { const n = { ...prev }; delete n[shot.id]; return n; });
    } else {
      setShots((prev) => prev.map((x) => (x.id === shot.id ? { ...x, ...payload } : x)));
    }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-green-800">未入力ショットを後から登録</h2>
        <span className="text-xs text-green-500 tabular-nums">{shots.length} 件</span>
      </div>

      {Array.from(grouped.entries()).map(([roundId, r]) => (
        <div key={roundId} className="border border-green-100 rounded-xl p-3 space-y-2">
          <p className="text-xs text-green-500">
            {new Date(r.date).toLocaleDateString("ja-JP")} · {r.course}
          </p>
          {Array.from(r.holes.entries())
            .sort(([a], [b]) => a - b)
            .map(([holeNum, holeShots]) => (
              <div key={holeNum} className="space-y-1">
                <p className="text-sm font-bold text-green-700">{holeNum}H</p>
                {holeShots
                  .sort((a, b) => a.shot_number - b.shot_number)
                  .map((shot) => {
                    const draft = drafts[shot.id] ?? {};
                    const club = (draft.club ?? shot.club) as string | null;
                    const isExpanded = !!expanded[shot.id];
                    return (
                      <div key={shot.id} className="bg-green-50 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-green-600 w-12">
                            第{shot.shot_number}打
                          </span>
                          {shot.distance_yards != null && (
                            <span className="text-xs text-green-500 tabular-nums w-12">
                              {shot.distance_yards}y
                            </span>
                          )}
                          <select
                            value={club ?? ""}
                            onChange={(e) => setDraft(shot.id, { club: e.target.value || null })}
                            className="flex-1 text-sm px-2 py-1.5 rounded-lg border border-green-200 bg-white text-green-800"
                          >
                            <option value="">クラブを選択</option>
                            {CLUBS.map((c) => (
                              <option key={c} value={c}>{CLUB_LABELS[c as Club]}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => setExpanded((prev) => ({ ...prev, [shot.id]: !prev[shot.id] }))}
                            className="text-green-500 text-xs px-2 py-1.5"
                          >
                            {isExpanded ? "▲ 詳細" : "▼ 詳細"}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="space-y-2 pt-1.5 border-t border-green-100">
                            <ChipRow
                              label="球筋"
                              options={BALL_SHAPE_OPTIONS}
                              value={(draft.ball_shape ?? shot.ball_shape) as string | null}
                              onChange={(v) => setDraft(shot.id, { ball_shape: v })}
                            />
                            <ChipRow
                              label="方向"
                              options={BALL_DIRECTION_OPTIONS}
                              value={(draft.ball_direction ?? shot.ball_direction) as string | null}
                              onChange={(v) => setDraft(shot.id, { ball_direction: v })}
                            />
                            <ChipRow
                              label="ライ縦"
                              options={LIE_VERTICAL_OPTIONS}
                              value={(draft.lie_vertical ?? shot.lie_vertical) as string | null}
                              onChange={(v) => setDraft(shot.id, { lie_vertical: v })}
                            />
                            <ChipRow
                              label="ライ横"
                              options={LIE_HORIZONTAL_OPTIONS}
                              value={(draft.lie_horizontal ?? shot.lie_horizontal) as string | null}
                              onChange={(v) => setDraft(shot.id, { lie_horizontal: v })}
                            />
                            <div>
                              <p className="text-xs font-semibold text-green-600 mb-1">メモ</p>
                              <textarea
                                value={(draft.note ?? shot.note) ?? ""}
                                onChange={(e) => setDraft(shot.id, { note: e.target.value || null })}
                                rows={2}
                                className="w-full text-sm px-2 py-1.5 rounded-lg border border-green-200 bg-white text-green-800"
                              />
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => save(shot)}
                          disabled={savingId === shot.id || !club}
                          className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 active:bg-green-800
                                     text-white text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingId === shot.id ? "保存中..." : "保存"}
                        </button>
                      </div>
                    );
                  })}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

function ChipRow({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-green-600 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(active ? null : opt)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                active
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-green-200 text-green-700 hover:bg-green-50"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
