"use client";

import { useState } from "react";

type Mode = "dracon" | "reverse";

export interface DraconHole {
  hole_number: number;
  mode:        Mode;
}

const MAX_HOLES = 4;
const HOLE_NUMBERS = Array.from({ length: 18 }, (_, i) => i + 1);

export function CompeHolesClient({
  id,
  holes: initialHoles,
}: {
  id:    string;
  holes: DraconHole[];
}) {
  const [holes, setHoles] = useState<DraconHole[]>(initialHoles);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // 既に他行で選択済みのホール番号（重複防止に使う）。
  const usedNumbers = new Set(holes.map((h) => h.hole_number));

  // 追加時、まだ使われていない最小のホール番号を初期値にする。
  function nextFreeHole(): number {
    for (const n of HOLE_NUMBERS) {
      if (!usedNumbers.has(n)) return n;
    }
    return 1;
  }

  function addHole() {
    if (holes.length >= MAX_HOLES) return;
    setHoles((prev) => [...prev, { hole_number: nextFreeHole(), mode: "dracon" }]);
  }

  function removeHole(index: number) {
    setHoles((prev) => prev.filter((_, i) => i !== index));
  }

  function setHoleNumber(index: number, hole_number: number) {
    setHoles((prev) => prev.map((h, i) => (i === index ? { ...h, hole_number } : h)));
  }

  function setHoleMode(index: number, mode: Mode) {
    setHoles((prev) => prev.map((h, i) => (i === index ? { ...h, mode } : h)));
  }

  async function handleSave() {
    setMessage(null);
    setSaving(true);
    const res = await fetch(`/api/compe/${id}/holes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holes }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "保存に失敗しました" });
      setSaving(false);
      return;
    }

    // 保存後の正規化済みデータで置き換える。
    if (Array.isArray(data.holes)) setHoles(data.holes as DraconHole[]);
    setMessage({ type: "ok", text: "保存しました" });
    setSaving(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-green-800">ドラコン対象ホール（最大4）</h2>

      {message && (
        <div
          className={
            message.type === "ok"
              ? "bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm"
              : "bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm"
          }
        >
          {message.text}
        </div>
      )}

      {holes.length === 0 ? (
        <p className="text-sm text-green-400 text-center py-2">
          対象ホールがありません。
          <br />
          下のボタンから追加しましょう。
        </p>
      ) : (
        <div className="space-y-3">
          {holes.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={h.hole_number}
                onChange={(e) => setHoleNumber(i, Number(e.target.value))}
              >
                {HOLE_NUMBERS.map((n) => (
                  <option
                    key={n}
                    value={n}
                    disabled={n !== h.hole_number && usedNumbers.has(n)}
                  >
                    {n}番ホール
                  </option>
                ))}
              </select>

              <select
                className="input flex-1"
                value={h.mode}
                onChange={(e) => setHoleMode(i, e.target.value as Mode)}
              >
                <option value="dracon">ドラコン</option>
                <option value="reverse">逆ドラコン</option>
              </select>

              <button
                onClick={() => removeHole(i)}
                className="text-xs text-red-400 hover:text-red-500 hover:underline flex-shrink-0"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addHole}
        disabled={holes.length >= MAX_HOLES}
        className="btn-secondary w-full disabled:opacity-50"
      >
        ホールを追加
      </button>

      <button
        onClick={handleSave}
        className={`btn-primary w-full ${justSaved ? "bg-green-800" : ""}`}
        disabled={saving}
      >
        {justSaved ? "✓ 保存しました" : saving ? "保存中..." : "保存"}
      </button>
    </div>
  );
}
