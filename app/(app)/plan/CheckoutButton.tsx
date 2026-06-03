"use client";

import { useState, useRef } from "react";

export function CheckoutButton({ plan, label }: { plan: "premium"; label: string }) {
  const [loading, setLoading] = useState(false);
  // 連打ガード：state(loading) の反映＝再レンダ前の同フレーム連打を取りこぼさないよう、
  // 同期的に判定できる ref を使う（二重に Checkout セッションを作らせない）。
  const processingRef = useRef(false);

  async function handleClick() {
    if (processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    } finally {
      processingRef.current = false;
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full py-3 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700
                 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          処理中...
        </span>
      ) : (
        label
      )}
    </button>
  );
}
