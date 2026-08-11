"use client";

import { useEffect } from "react";

/**
 * 代理測定の直後に出す全画面の結果表示。
 *
 * 用途は「同伴者本人にスマホを見せて数字を伝える」こと。腕を伸ばした距離や、
 * 隣に立った人が覗き込む距離から読めることを最優先にしている：
 *   - 数字が画面内で最大（clamp で端末幅に追従。小型機でも溢れず、大型機では巨大に）
 *   - 屋外の直射日光下を想定して白背景＋濃色文字（最大輝度でコントラストが出る）
 *   - 画面のどこをタップしても閉じる（グローブ・濡れた指でも当てやすい）
 *   - 数秒で自動的に閉じる（見せ終わったあと放置してもプレーに戻れる）
 */
export function GuestResultOverlay({
  guestName,
  yards,
  meters,
  saveFailed = false,
  onClose,
  autoCloseMs = 8000,
}: {
  guestName: string;
  yards: number;
  meters: number | null;
  saveFailed?: boolean;
  onClose: () => void;
  autoCloseMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [onClose, autoCloseMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClose}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center
                 bg-white px-4 text-center cursor-pointer select-none"
    >
      {/* 同伴者名 — 誰の記録かが一目で分かるように大きめに */}
      <p
        className="font-bold text-green-700 leading-tight break-all max-w-full"
        style={{ fontSize: "clamp(1.75rem, 9vw, 3.5rem)" }}
      >
        {guestName}さん
      </p>

      {/* 数字 — 画面内で最大。tabular-nums で桁のガタつきを防ぐ */}
      <p
        className="font-black text-green-900 leading-none tabular-nums my-2"
        style={{ fontSize: "clamp(6rem, 40vw, 18rem)" }}
      >
        {yards}
      </p>

      <p
        className="font-bold text-green-800 leading-none"
        style={{ fontSize: "clamp(2rem, 11vw, 4.5rem)" }}
      >
        ヤード
      </p>

      {meters != null && (
        <p className="mt-4 text-2xl text-green-500 tabular-nums">
          （{meters}m）
        </p>
      )}

      {saveFailed && (
        <p className="mt-6 text-base text-amber-700 bg-amber-50 border border-amber-200
                      rounded-xl px-4 py-2 max-w-xs">
          ⚠️ 記録の保存に失敗しました（表示中の数字は実測値です）
        </p>
      )}

      <p className="mt-8 text-lg text-gray-400">タップで閉じる</p>
    </div>
  );
}
