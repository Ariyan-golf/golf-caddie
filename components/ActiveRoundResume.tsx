"use client";

// iPhone Safari は電池低下・画面スリープ・アプリ切替でページを破棄する。
// その際 React state は消え、PWA は start_url("/") で再起動するため、進行中の
// /round/[id] 画面から「最初（ホーム）」へ戻ってしまう。ここでアプリ起動時に
// 端末保存スナップショットを確認し、未完了の進行中ラウンドがあれば自動で
// /round/[id] へ復帰させ、「最初のホールに戻る」事故を防ぐ。

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFreshActiveRound, isUnfinished } from "@/lib/activeRound";

// このセッションで復帰判定済みの印。アプリ起動（ページ破棄→再読込で新セッション）
// のときだけ復帰させ、ラウンド中に意図的にホームを開いた SPA 遷移では引き戻さない。
// sessionStorage はタブ/アプリ終了で消えるため「コールドスタート」の判定に使える。
const SESSION_FLAG = "gca_resume_checked";

export function ActiveRoundResume() {
  const router = useRouter();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // sessionStorage 不可環境では毎回チェックにフォールバック（実害なし）。
    }
    const snap = getFreshActiveRound();
    if (snap && isUnfinished(snap)) {
      // replace（push でない）でホームを履歴に残さず続きへ戻す。
      router.replace(`/round/${snap.roundId}`);
    }
  }, [router]);

  return null;
}
