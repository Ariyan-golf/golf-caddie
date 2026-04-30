"use client";

import { useState } from "react";

export function RoundPaymentButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout-once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700
                 active:bg-blue-800 text-white transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          処理中...
        </span>
      ) : (
        "⛳ 330円でラウンド利用を開始する"
      )}
    </button>
  );
}
