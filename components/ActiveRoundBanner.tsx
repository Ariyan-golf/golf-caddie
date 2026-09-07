"use client";

// ActiveRoundResume（自動復帰）が何らかの理由で発動しなかった場合の受け皿。
// 18時間以内かつ未完了のラウンドスナップショットがあれば、ホーム上部に
// 「ラウンドに戻る」導線を常時表示する。自動復帰が正常に効いた場合は
// router.replace が先に走るため、この表示自体はほぼ見えない想定。

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFreshActiveRound, isUnfinished, type ActiveRoundSnapshot } from "@/lib/activeRound";

export function ActiveRoundBanner() {
  const [snap, setSnap] = useState<ActiveRoundSnapshot | null>(null);

  useEffect(() => {
    const s = getFreshActiveRound();
    if (s && isUnfinished(s)) setSnap(s);
  }, []);

  if (!snap) return null;

  return (
    <Link
      href={`/round/${snap.roundId}`}
      className="card border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center gap-3 hover:border-amber-400 transition-colors"
    >
      <span className="text-3xl flex-shrink-0">⛳</span>
      <div className="flex-1">
        <p className="font-bold text-amber-900 text-sm">ラウンドに戻る</p>
        <p className="text-xs text-amber-600 mt-0.5">
          {snap.courseName}・{snap.currentHoleNumber}番ホールから再開できます
        </p>
      </div>
      <span className="text-amber-500 text-lg flex-shrink-0">→</span>
    </Link>
  );
}
