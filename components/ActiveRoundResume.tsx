"use client";

// iPhone Safari は電池低下・画面スリープ・アプリ切替でページを破棄する。
// その際 React state は消え、PWA は start_url("/") で再起動するため、進行中の
// /round/[id] 画面から「最初（ホーム）」へ戻ってしまう。ここでアプリ起動時に
// 端末保存スナップショットを確認し、未完了の進行中ラウンドがあれば自動で
// /round/[id] へ復帰させ、「最初のホールに戻る」事故を防ぐ。

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFreshActiveRound, isUnfinished } from "@/lib/activeRound";

// このJSコンテキストで復帰判定済みの印。モジュールスコープ変数なので、
// アプリが実際に終了して JS が再読み込みされたとき（コールドスタート）だけ
// false に戻る。ラウンド中に意図的にホームへ SPA 遷移した場合は同じ JS
// コンテキストが生き続けるため true のままとなり、そちらでは引き戻さない。
// （sessionStorage は iOS PWA では終了→再起動後も引き継がれることがあり、
// その場合「コールドスタートなのに自動復帰しない」事故につながるため使わない。）
let resumeCheckedThisLoad = false;

export function ActiveRoundResume() {
  const router = useRouter();

  useEffect(() => {
    if (resumeCheckedThisLoad) return;
    resumeCheckedThisLoad = true;

    const snap = getFreshActiveRound();
    if (snap && isUnfinished(snap)) {
      // replace（push でない）でホームを履歴に残さず続きへ戻す。
      router.replace(`/round/${snap.roundId}`);
    }
  }, [router]);

  return null;
}
