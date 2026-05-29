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
      aria-label="1つ前の画面に戻る"
      className="flex items-center justify-center w-11 h-11 -ml-2 rounded-full
                 text-green-700 hover:bg-green-50 active:bg-green-100
                 active:scale-95 transition-colors"
    >
      <ChevronLeft className="w-6 h-6" />
    </button>
  );
}
