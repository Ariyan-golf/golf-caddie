"use client";

import { useState } from "react";

export function PayButton({ courseId }: { courseId: string }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout-day-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId }),
      });

      let data: { url?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setError("サーバーエラーが発生しました。しばらく待ってから再試行してください。");
        setIsProcessing(false);
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error ?? "決済ページの取得に失敗しました。");
        setIsProcessing(false);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("通信エラーが発生しました。インターネット接続を確認してください。");
      setIsProcessing(false);
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
        disabled={isProcessing}
        aria-busy={isProcessing}
        className="w-full py-3.5 rounded-xl text-base font-semibold bg-green-600 hover:bg-green-700
                   active:bg-green-800 text-white transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <span
              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            処理中...
          </span>
        ) : (
          "330円を今日中に支払う"
        )}
      </button>
    </div>
  );
}
