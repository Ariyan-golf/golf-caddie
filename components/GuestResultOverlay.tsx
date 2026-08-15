"use client";

import { useEffect } from "react";

/**
 * 同伴者の計測直後に出す全画面の結果表示。
 *
 * 用途は「同伴者本人にスマホを見せて数字を伝える」こと。数字を伝えれば目的は
 * 完了するため、この結果はどこにも保存しない（名前も持たない＝数字だけを出す）。
 * 腕を伸ばした距離や、隣に立った人が覗き込む距離から読めることを最優先にしている：
 *   - 数字が画面内で最大（clamp で端末幅に追従。小型機でも溢れず、大型機では巨大に）
 *   - 屋外の直射日光下を想定して白背景＋濃色文字（最大輝度でコントラストが出る）
 *   - 画面のどこをタップしても閉じる（グローブ・濡れた指でも当てやすい）
 *   - 数秒で自動的に閉じる（見せ終わったあと放置してもプレーに戻れる）
 */
export function GuestResultOverlay({
  yards,
  meters,
  onClose,
  autoCloseMs = 8000,
}: {
  yards: number;
  meters: number | null;
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

      <p className="mt-8 text-lg text-gray-400">タップで閉じる</p>
    </div>
  );
}
