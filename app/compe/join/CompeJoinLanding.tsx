"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type JoinState =
  | { status: "idle" }
  | { status: "joining" }
  | { status: "joined"; eventName: string | null }
  | { status: "error"; message: string };

export function CompeJoinLanding({
  code,
  isLoggedIn,
}: {
  code: string;
  isLoggedIn: boolean;
}) {
  const [state, setState] = useState<JoinState>({ status: "idle" });
  // React Strict Mode などで二重発火しないようガード
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!code) {
      setState({ status: "error", message: "参加コードが指定されていません" });
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      setState({ status: "joining" });
      // 参加は既存の /api/compe/join（ユーザーセッション＋RLS）を再利用。
      const res = await fetch("/api/compe/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", message: data.error ?? "参加に失敗しました" });
        return;
      }
      setState({ status: "joined", eventName: data.event_name ?? null });
    })();
  }, [isLoggedIn, code]);

  // ── 未ログイン：コードを大きく表示し、ログインへ誘導 ──
  if (!isLoggedIn) {
    return (
      <div className="space-y-4">
        <div className="card bg-amber-50 border-amber-300 space-y-2 text-center">
          <p className="text-sm font-semibold text-amber-800">参加コード</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-amber-900 tabular-nums py-2">
            {code || "—"}
          </p>
          <p className="text-xs text-amber-600">このコードのコンペに参加します</p>
        </div>

        <Link href="/login" className="btn-primary w-full block text-center">
          ログイン／新規登録して参加する
        </Link>

        <p className="text-xs text-green-500 leading-relaxed text-center">
          ログイン後、もう一度この参加リンクを開くと自動で参加できます。
          <br />
          または、ホームの「コンペに参加（参加コード入力）」に
          <span className="font-semibold text-green-600"> {code || "コード"} </span>
          を入力してください。
        </p>
      </div>
    );
  }

  // ── ログイン済み：自動で参加処理 ──
  return (
    <div className="space-y-4">
      {state.status === "joining" && (
        <div className="card text-center text-green-500 text-sm py-8">参加処理中…</div>
      )}

      {state.status === "joined" && (
        <div className="card bg-green-50 border-green-300 space-y-2 text-center">
          <p className="text-3xl">🎉</p>
          <p className="font-bold text-green-800">
            {state.eventName ? `「${state.eventName}」に参加しました！` : "コンペに参加しました！"}
          </p>
          <p className="text-xs text-green-600">
            ホームの「コンペ開催中」からランキングを確認できます。
          </p>
        </div>
      )}

      {state.status === "error" && (
        <div className="card bg-red-50 border-red-200 space-y-1 text-center">
          <p className="font-semibold text-red-600">{state.message}</p>
          {code && (
            <p className="text-xs text-red-400">参加コード: {code}</p>
          )}
        </div>
      )}

      <Link href="/" className="btn-primary w-full block text-center">
        ホームに戻る
      </Link>
    </div>
  );
}
