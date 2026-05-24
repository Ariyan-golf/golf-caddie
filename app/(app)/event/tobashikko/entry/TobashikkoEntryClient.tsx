"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface DriverShot {
  id: string;
  distance_yards: number;
  hole_number: number;
  course_name: string;
  date: string;
}

export interface EntryRow {
  id:           string;
  shot_id:      string;
  driver_brand: string | null;
  ball_brand:   string | null;
}

const BRAND_OPTIONS = [
  "テーラーメイド",
  "キャロウェイ",
  "ピン",
  "タイトリスト",
  "ダンロップ・スリクソン",
  "ブリヂストン",
  "ミズノ",
  "本間",
  "ヤマハ",
  "コブラ",
] as const;

const OTHER = "その他";

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ja-JP");
}

function ShotLine({ shot }: { shot: DriverShot }) {
  return (
    <div className="text-sm text-green-800">
      <span className="font-bold tabular-nums">{shot.distance_yards}y</span>
      <span className="text-green-500 mx-1.5">/</span>
      <span>{shot.course_name} H{shot.hole_number}</span>
      <span className="text-xs text-green-400 ml-1.5">{fmtDate(shot.date)}</span>
    </div>
  );
}

export function TobashikkoEntryClient({
  driverShots,
  entries,
}: {
  driverShots: DriverShot[];
  entries:     EntryRow[];
}) {
  const router = useRouter();
  const [busyShotId,  setBusyShotId]  = useState<string | null>(null);
  const [topError,    setTopError]    = useState<string>("");

  const entryByShotId = useMemo(
    () => new Map(entries.map((e) => [e.shot_id, e])),
    [entries]
  );
  const shotById = useMemo(
    () => new Map(driverShots.map((s) => [s.id, s])),
    [driverShots]
  );

  const entryable = driverShots.filter((s) => !entryByShotId.has(s.id));
  const entered   = entries
    .map((e) => ({ entry: e, shot: shotById.get(e.shot_id) }))
    .filter((row): row is { entry: EntryRow; shot: DriverShot } => row.shot != null)
    .sort((a, b) => b.shot.distance_yards - a.shot.distance_yards);

  async function handleEntry(shotId: string) {
    setTopError("");
    setBusyShotId(shotId);
    try {
      const res = await fetch("/api/event/tobashikko/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shot_id: shotId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTopError(data.error ?? "エントリーに失敗しました");
        return;
      }
      router.refresh();
    } finally {
      setBusyShotId(null);
    }
  }

  return (
    <>
      {topError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {topError}
        </div>
      )}

      {/* セクション1: エントリーできるショット */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-green-800">エントリーできるショット</h2>
        {entryable.length === 0 ? (
          <p className="text-sm text-green-500 leading-relaxed py-2">
            エントリーできるショットがありません。<br />
            ラウンドでドライバーの飛距離を記録するとここに表示されます。
          </p>
        ) : (
          <div className="space-y-2">
            {entryable.map((shot) => (
              <div
                key={shot.id}
                className="flex items-center justify-between gap-2 py-2 border-b border-green-50 last:border-0"
              >
                <ShotLine shot={shot} />
                <button
                  onClick={() => handleEntry(shot.id)}
                  disabled={busyShotId === shot.id}
                  className="bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0"
                >
                  {busyShotId === shot.id ? "..." : "エントリー"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* セクション2: エントリー済み */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-green-800">
          エントリー済み（使用クラブ・ボールを入力）
        </h2>
        {entered.length === 0 ? (
          <p className="text-sm text-green-500 py-2">エントリー済みのショットはまだありません。</p>
        ) : (
          <div className="space-y-4">
            {entered.map(({ entry, shot }) => (
              <EnteredRow key={entry.id} entry={entry} shot={shot} onChanged={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// ── エントリー済み1行（編集UI付き） ─────────────────────────────────
function EnteredRow({
  entry, shot, onChanged,
}: {
  entry: EntryRow;
  shot:  DriverShot;
  onChanged: () => void;
}) {
  const initial = (raw: string | null) => {
    if (!raw) return { sel: "", other: "" };
    if (BRAND_OPTIONS.includes(raw as typeof BRAND_OPTIONS[number])) {
      return { sel: raw, other: "" };
    }
    return { sel: OTHER, other: raw };
  };
  const d0 = initial(entry.driver_brand);
  const b0 = initial(entry.ball_brand);

  const [driverSel,   setDriverSel]   = useState(d0.sel);
  const [driverOther, setDriverOther] = useState(d0.other);
  const [ballSel,     setBallSel]     = useState(b0.sel);
  const [ballOther,   setBallOther]   = useState(b0.other);

  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg,     setMsg]     = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function resolveValue(sel: string, other: string): string | null {
    if (!sel) return null;
    if (sel === OTHER) {
      const v = other.trim();
      return v ? v : null;
    }
    return sel;
  }

  async function handleSave() {
    setMsg(null);

    if (driverSel === OTHER && !driverOther.trim()) {
      setMsg({ type: "err", text: "「その他」のドライバー名を入力してください" });
      return;
    }
    if (ballSel === OTHER && !ballOther.trim()) {
      setMsg({ type: "err", text: "「その他」のボール名を入力してください" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/event/tobashikko/entry/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_brand: resolveValue(driverSel, driverOther),
          ball_brand:   resolveValue(ballSel,   ballOther),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: data.error ?? "保存に失敗しました" });
        return;
      }
      setMsg({ type: "ok", text: "保存しました" });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("このエントリーを取り消しますか？")) return;
    setDeleting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/event/tobashikko/entry/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg({ type: "err", text: data.error ?? "削除に失敗しました" });
        return;
      }
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border border-green-100 rounded-xl p-3 space-y-3 bg-green-50/40">
      <div className="flex items-center justify-between gap-2">
        <ShotLine shot={shot} />
        <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
          エントリー済み
        </span>
      </div>

      <BrandPicker
        label="使用ドライバー"
        sel={driverSel}   setSel={setDriverSel}
        other={driverOther} setOther={setDriverOther}
      />
      <BrandPicker
        label="使用ボール"
        sel={ballSel}   setSel={setBallSel}
        other={ballOther} setOther={setBallOther}
      />

      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-700 text-xs font-medium px-3 py-2 rounded-xl"
        >
          {deleting ? "..." : "エントリー取消"}
        </button>
      </div>
    </div>
  );
}

function BrandPicker({
  label, sel, setSel, other, setOther,
}: {
  label: string;
  sel: string; setSel: (v: string) => void;
  other: string; setOther: (v: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="input"
      >
        <option value="">未選択</option>
        {BRAND_OPTIONS.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
        <option value={OTHER}>{OTHER}</option>
      </select>
      {sel === OTHER && (
        <input
          type="text"
          className="input mt-2"
          placeholder="メーカー名を入力"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          maxLength={50}
        />
      )}
    </div>
  );
}
