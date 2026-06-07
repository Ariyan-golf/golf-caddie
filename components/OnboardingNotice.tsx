"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "gca_onboarding_v1";

export function OnboardingNotice() {
  // SSR では何も描画しない（localStorage はクライアントでしか読めないため）。
  // useEffect 内でのみ localStorage を参照し、ハイドレーション不整合を避ける。
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") {
        setOpen(true);
      }
    } catch {
      // localStorage が使えない環境では案内を出さない（致命的でないため握りつぶす）。
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // 保存できなくても閉じる動作は継続する。
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gca-onboarding-title"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl border border-green-100">
        {/* × ボタン（OK と同じく既読保存する） */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="閉じる"
          className="absolute top-2 right-2 h-8 w-8 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600
                     flex items-center justify-center text-lg leading-none transition-colors"
        >
          ×
        </button>

        <h2
          id="gca-onboarding-title"
          className="text-lg font-bold text-green-800 pr-6"
        >
          Golf Caddie AI へようこそ
        </h2>

        <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            📵 ラウンド中は「おやすみモード（集中モード）」がおすすめです。
            着信や通知で気が散らず、GPS計測やスコア記録はそのまま使えます。
            <span className="block text-xs text-gray-500 mt-1">
              （機内モードは一部機能が止まるので避けてください）
            </span>
          </p>
          <p>
            📲 「ホーム画面に追加」すると、アプリのように起動できます。
          </p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full py-3 px-4 rounded-xl bg-green-600 text-white text-sm font-bold
                     hover:bg-green-700 transition-colors active:scale-[0.98]"
        >
          OK
        </button>
      </div>
    </div>
  );
}
