"use client";

import { useState } from "react";

export function CancelButton() {
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch("/api/cancel-account", { method: "POST" });
      if (!res.ok) throw new Error();
      setDone(true);
      setShowDialog(false);
    } catch {
      alert("処理に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="card bg-gray-50 border-gray-200 text-center space-y-1 py-5">
        <p className="text-sm font-semibold text-gray-700">退会のお申し込みを受け付けました</p>
        <p className="text-xs text-gray-500">引き続き30日間はサービスをご利用いただけます。</p>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="w-full py-2.5 rounded-xl text-sm font-medium text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-colors"
      >
        退会する
      </button>

      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <h2 className="text-base font-bold text-gray-800">退会の確認</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              退会してよろしいですか？退会後30日間は引き続きご利用いただけます。翌月の請求は発生しません。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDialog(false)}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
              >
                いいえ
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {loading ? "処理中..." : "はい、退会します"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
