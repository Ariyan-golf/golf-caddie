"use client";

// /round/[id] がDB上に存在しない（削除済み・他端末で削除済み等）場合の受け皿。
// 端末の自動復帰スナップショット（gca_active_round）が同じ roundId を指していれば
// 破棄してからホームへ戻す。破棄しないと次回起動時も同じ「存在しないラウンド」へ
// 自動復帰しようとし続けてしまう。

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearActiveRound, readActiveRound } from "@/lib/activeRound";

export function RoundNotFoundRedirect({ roundId }: { roundId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (readActiveRound(roundId)) clearActiveRound();
    router.replace("/");
  }, [roundId, router]);

  return null;
}
