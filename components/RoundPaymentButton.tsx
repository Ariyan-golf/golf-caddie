"use client";

import { useState } from "react";

export function RoundPaymentButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout-day-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      let data: { url?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setError("サーバーエラーが発生しました。しばらく待ってから再試行してください。");
        setLoading(false);
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error ?? "決済ページの取得に失敗しました。");
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("通信エラーが発生しました。インターネット接続を確認してください。");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠️ {error}
        </p>
      )}
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "読み込み中..." : "課金してラウンド利用を開始する"}
      </button>
    </div>
  );
}
