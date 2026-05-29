"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// 1つ前の画面に戻るボタン（ブラウザバック相当）。
// ラウンド開始画面から来た人は開始画面へ、一覧から来た人は一覧へ戻る。
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="戻る"
      className="flex items-center gap-1.5 px-2 py-2 rounded-md
                 text-green-700 hover:bg-green-50 active:bg-green-100
                 active:scale-95 transition-colors"
    >
      <ChevronLeft className="w-5 h-5" />
      <span className="text-sm font-medium">戻る</span>
    </button>
  );
}
