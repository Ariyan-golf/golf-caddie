"use client";

import { useState } from "react";

export interface CompeRow {
  id:         string;
  event_name: string;
  event_code: string | null;
  start_date: string;
}

function formatDate(iso: string) {
  // start_date は "YYYY-MM-DD"。タイムゾーンずれを避けてパース。
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function CompeClient({ initialCompes }: { initialCompes: CompeRow[] }) {
  const [compes, setCompes] = useState<CompeRow[]>(initialCompes);

  const [eventName, setEventName] = useState("");
  const [date,      setDate]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreatedCode(null);

    const name = eventName.trim();
    if (!name) { setError("コンペ名を入力してください"); return; }
    if (!date) { setError("開催日を選択してください"); return; }

    setLoading(true);
    const res = await fetch("/api/compe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_name: name, date }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "作成に失敗しました");
      setLoading(false);
      return;
    }

    const compe = data.compe as CompeRow;
    setCreatedCode(compe.event_code ?? null);
    setCompes((prev) => [
      {
        id:         compe.id,
        event_name: compe.event_name,
        event_code: compe.event_code,
        start_date: compe.start_date,
      },
      ...prev,
    ]);
    setEventName("");
    setDate("");
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* ── 新しいコンペを作る ── */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <h2 className="font-semibold text-green-800">新しいコンペを作る</h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="label">コンペ名</label>
          <input
            type="text"
            className="input"
            placeholder="例: 〇〇カップ ドラコン大会"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            maxLength={40}
          />
        </div>

        <div>
          <label className="label">開催日</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "作成中..." : "作成"}
        </button>
      </form>

      {/* ── 生成された参加コード（共有用） ── */}
      {createdCode && (
        <div className="card bg-green-50 border-green-300 space-y-2 text-center">
          <p className="text-sm font-semibold text-green-700">コンペを作成しました！</p>
          <p className="text-xs text-green-600">参加者にこの参加コードを共有してください</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-green-800 tabular-nums py-2">
            {createdCode}
          </p>
        </div>
      )}

      {/* ── 自分が作ったコンペ一覧 ── */}
      <div className="card">
        <h2 className="font-semibold text-green-800 mb-3">自分が作ったコンペ</h2>
        {compes.length === 0 ? (
          <p className="text-sm text-green-400 text-center py-4">
            まだコンペがありません。
            <br />
            上のフォームから作成しましょう！
          </p>
        ) : (
          <div className="space-y-2">
            {compes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-green-50 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-green-800 text-sm truncate">{c.event_name}</p>
                  <p className="text-xs text-green-500">{formatDate(c.start_date)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="font-mono font-bold tracking-widest text-green-700 text-sm">
                    {c.event_code ?? "—"}
                  </span>
                  {/* 管理画面は次スライスで作成（今回はリンクを張らない） */}
                  <span className="text-xs text-green-300">管理（準備中）</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
