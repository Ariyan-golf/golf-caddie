"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// 決済完了画面のポーリング補助。
// /pay/success はサーバーで1回描画するだけなので、webhook 反映前に着地すると
// 「⏳決済処理中」のまま固定する。day_pass_date が当日になる（paid=true）まで
// 数秒間隔で router.refresh() してサーバー再描画を促し、反映されたら停止する。
// 最大 MAX_MS で打ち切り（無限ポーリング防止）。表示自体は page.tsx 側が担当。
export function PollUntilPaid({ paid }: { paid: boolean }) {
  const router = useRouter();
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    // 既に反映済みならポーリング不要。
    if (paid) return;

    const INTERVAL_MS = 3000;
    const MAX_MS = 30000;

    const id = setInterval(() => {
      if (Date.now() - startRef.current >= MAX_MS) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, [paid, router]);

  return null;
}
