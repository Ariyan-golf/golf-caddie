"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CompeJoinByCode } from "@/components/CompeJoinByCode";

export interface CompeRow {
  id:         string;
  event_name: string;
  event_code: string | null;
  start_date: string;
}

// 参加したコンペ（読み取り専用入口）。参加コード等は不要。
export interface JoinedCompe {
  id:         string;
  event_name: string;
  start_date: string;
}

function formatDate(iso: string) {
  // start_date は "YYYY-MM-DD"。タイムゾーンずれを避けてパース。
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 参加リンク用 URL。ドメインはハードコードせず実行中オリジンから組み立てる。
function joinUrl(origin: string, code: string) {
  return `${origin}/compe/join?code=${encodeURIComponent(code)}`;
}

export function CompeClient({
  initialCompes,
  joinedCompes,
}: {
  initialCompes: CompeRow[];
  joinedCompes:  JoinedCompe[];
}) {
  const [compes, setCompes] = useState<CompeRow[]>(initialCompes);

  const [eventName, setEventName] = useState("");
  const [date,      setDate]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  // 削除：確認中の行 id・削除実行中の行 id・完了表示
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [deleted,      setDeleted]      = useState(false);

  // QRに埋め込むオリジン。SSR では window が無いのでマウント後に取得する。
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError("");
    const res = await fetch("/api/compe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "削除に失敗しました");
      setDeletingId(null);
      setConfirmingId(null);
      return;
    }

    setCompes((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
    setConfirmingId(null);
    setDeleted(true);
  }

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
      {/* ── 自分が作ったコンペ一覧 ── */}
      <div className="card">
        <h2 className="font-semibold text-green-800 mb-3">自分が作ったコンペ</h2>
        {deleted && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-2.5 text-sm mb-3 text-center">
            削除しました
          </div>
        )}
        {compes.length === 0 ? (
          <p className="text-sm text-green-400 text-center py-4">
            まだコンペがありません。
            <br />
            下のフォームから作成しましょう！
          </p>
        ) : (
          <div className="space-y-2">
            {compes.map((c) => (
              <div
                key={c.id}
                className="py-2 border-b border-green-50 last:border-0"
              >
                {confirmingId === c.id ? (
                  /* ── インライン削除確認 ── */
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-red-600 font-medium min-w-0 truncate">
                      「{c.event_name}」を削除しますか？
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        {deletingId === c.id ? "削除中…" : "削除する"}
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        disabled={deletingId === c.id}
                        className="text-xs text-green-500 underline disabled:opacity-50"
                      >
                        やめる
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── 通常表示 ── */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-green-800 text-sm truncate">{c.event_name}</p>
                        <p className="text-xs text-green-500">{formatDate(c.start_date)}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-mono font-bold tracking-widest text-green-700 text-sm">
                          {c.event_code ?? "—"}
                        </span>
                        <a
                          href={`/compe/${c.id}`}
                          className="text-xs text-green-600 hover:text-green-700 hover:underline font-medium"
                        >
                          管理する
                        </a>
                        <button
                          onClick={() => { setConfirmingId(c.id); setDeleted(false); }}
                          className="text-xs text-red-400 hover:text-red-500 hover:underline"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    {/* 参加用QR（コードあり＆オリジン取得後のみ） */}
                    {origin && c.event_code && (
                      <div className="flex items-center gap-2.5">
                        <div className="bg-white p-1.5 rounded-lg border border-green-100 flex-shrink-0">
                          <QRCodeSVG value={joinUrl(origin, c.event_code)} size={72} />
                        </div>
                        <p className="text-xs text-green-400 leading-relaxed">
                          このQRを読み取ると参加ページが開きます
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 参加したコンペ（読み取り専用の入口） ── */}
      {joinedCompes.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-green-800 mb-3">参加したコンペ</h2>
          <div className="space-y-2">
            {joinedCompes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-green-50 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-green-800 text-sm truncate">{c.event_name}</p>
                  <p className="text-xs text-green-500">{formatDate(c.start_date)}</p>
                </div>
                <Link
                  href={`/compe/${c.id}/result`}
                  className="text-xs text-green-600 hover:text-green-700 hover:underline font-medium flex-shrink-0"
                >
                  ランキングを見る
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <p className="text-xs text-green-600">参加者にこの参加コードまたはQRを共有してください</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-green-800 tabular-nums py-2">
            {createdCode}
          </p>
          {origin && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <div className="bg-white p-2 rounded-xl border border-green-200">
                <QRCodeSVG value={joinUrl(origin, createdCode)} size={140} />
              </div>
              <p className="text-xs text-green-500">QRを読み取ると参加ページが開きます</p>
            </div>
          )}
        </div>
      )}

      {/* ── 参加コードでコンペに参加 ── */}
      <CompeJoinByCode />
    </div>
  );
}
