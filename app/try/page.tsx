import type { Metadata } from "next";
import Link from "next/link";
import { SoloMeasure } from "./SoloMeasure";

export const metadata: Metadata = {
  title: "登録不要で飛距離を測る | Golf Caddie AI",
  description: "会員登録なしで、いますぐドライバーの飛距離をGPSで計測できます。",
};

/**
 * 登録不要のソロ飛距離計測ページ（/try）。
 *
 * (app) グループの外に置くことで auth ゲート（app/(app)/layout.tsx の redirect）を
 * 通らず、未ログインでも利用できる。middleware の openPaths に "/try" を追加済み。
 * DB・有料動線・飛ばしっこGO とは完全に独立（保存・ランキング・event_id なし）。
 */
export default function TryPage() {
  return (
    <div className="min-h-screen pb-10">
      <div className="max-w-lg mx-auto p-4 space-y-5">
        <div className="pt-4 text-center">
          <h1 className="text-2xl font-bold text-green-800">飛距離を測ってみよう</h1>
          <p className="text-xs text-green-500 mt-1">
            登録不要・GPSであなたの一発を計測します
          </p>
        </div>

        <SoloMeasure />

        <div className="pt-2 text-center text-xs text-green-600 space-y-1">
          <p>
            計測データをクラウドに保存するには{" "}
            <Link href="/register" className="underline font-semibold">
              無料登録
            </Link>
          </p>
          <p>
            すでに会員の方は{" "}
            <Link href="/login" className="underline">
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
