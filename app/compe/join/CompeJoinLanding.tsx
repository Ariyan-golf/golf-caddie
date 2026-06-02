"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";

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

  // ゲスト参加（未ログイン分岐用）。同意チェック・処理中・エラー。
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  // ゲスト参加：匿名サインイン → 同意記録（ベストエフォート） → 再描画で
  // 既存のログイン後フロー（useEffect が /api/compe/join を自動実行）に委譲する。
  // 失敗時は短いエラーを出すだけで画面は壊さない。
  async function handleGuestJoin() {
    setGuestError(null);
    setGuestBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data?.user) {
        setGuestError("ただいまゲスト参加を準備中です。お手数ですが新規登録からご参加ください。");
        setGuestBusy(false);
        return;
      }
      // 同意記録（本人セッション・RLSで可）。失敗しても参加は続行する。
      const nowIso = new Date().toISOString();
      await supabase
        .from("profiles")
        .update({
          terms_version:     TERMS_VERSION,
          privacy_version:   PRIVACY_VERSION,
          terms_agreed_at:   nowIso,
          privacy_agreed_at: nowIso,
        })
        .eq("id", data.user.id);
      // 匿名セッション確立後に再描画 → isLoggedIn=true となり、既存の自動参加が走る。
      router.refresh();
    } catch {
      setGuestError("ゲスト参加に失敗しました。お手数ですが新規登録からご参加ください。");
      setGuestBusy(false);
    }
  }

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

        {/* ── または：ゲスト参加（メール登録なし・匿名サインイン） ── */}
        <div className="flex items-center gap-3 my-1">
          <hr className="flex-1 border-green-200" />
          <span className="text-xs text-green-500">または</span>
          <hr className="flex-1 border-green-200" />
        </div>

        <div className="card space-y-3">
          <label className="flex items-start gap-2 text-sm text-green-700">
            <input
              type="checkbox"
              className="mt-0.5 flex-shrink-0"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              <Link href="/terms" target="_blank" rel="noopener" className="text-green-700 underline">利用規約</Link>
              ・
              <Link href="/privacy" target="_blank" rel="noopener" className="text-green-700 underline">プライバシーポリシー</Link>
              に同意する
            </span>
          </label>

          <button
            type="button"
            onClick={handleGuestJoin}
            disabled={!agreed || guestBusy}
            className="btn-primary w-full disabled:opacity-50"
          >
            {guestBusy ? "準備中…" : "ゲストで参加（メール登録なし）"}
          </button>

          {guestError && (
            <p className="text-xs text-red-500 text-center">{guestError}</p>
          )}

          <p className="text-[11px] text-green-400 leading-relaxed">
            メール登録なしですぐ参加できます。記録はこの端末に紐づきます。あとで登録すると記録を引き継げます。
          </p>
        </div>

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
