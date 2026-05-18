"use client";

import { useState } from "react";

type Tab = "ios" | "android";

export function GeoPermissionGuide({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("ios");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-5 pb-3 border-b border-gray-100 text-center space-y-1">
          <h2 className="text-base font-bold text-amber-700">
            📍 位置情報がオフになっている可能性があります
          </h2>
          <p className="text-sm text-gray-600">以下の手順で許可してください</p>
        </div>

        <div className="flex gap-1 px-3 pt-3">
          <button
            type="button"
            onClick={() => setTab("ios")}
            className={`flex-1 py-2 px-3 rounded-t-lg text-sm font-bold transition-colors ${
              tab === "ios"
                ? "bg-sky-50 text-sky-700 border-b-2 border-sky-500"
                : "text-gray-500 hover:bg-gray-50 border-b-2 border-transparent"
            }`}
          >
            iPhone Safari
          </button>
          <button
            type="button"
            onClick={() => setTab("android")}
            className={`flex-1 py-2 px-3 rounded-t-lg text-sm font-bold transition-colors ${
              tab === "android"
                ? "bg-green-50 text-green-700 border-b-2 border-green-500"
                : "text-gray-500 hover:bg-gray-50 border-b-2 border-transparent"
            }`}
          >
            Android Chrome
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3 text-sm leading-relaxed text-gray-700">
          {tab === "ios" ? (
            <>
              <section className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-sky-800">⭐ 簡単な方法（推奨）</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>URLバー左の「ぁあ」をタップ</li>
                  <li>「Webサイトの設定」をタップ</li>
                  <li>「位置情報」を「許可」に変更</li>
                </ol>
              </section>
              <section className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-gray-700">設定アプリから変更する場合</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>iPhone の「設定」アプリを開く</li>
                  <li>「プライバシーとセキュリティ」をタップ</li>
                  <li>「位置情報サービス」をタップ</li>
                  <li>「位置情報サービス」をON</li>
                  <li>下にスクロールして「Safari」をタップ</li>
                  <li>「Webサイトの使用中のみ許可」を選択</li>
                  <li>「正確な位置情報」もONに</li>
                </ol>
              </section>
            </>
          ) : (
            <>
              <section className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-green-800">⭐ 簡単な方法</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>URLバー左の鍵マークをタップ</li>
                  <li>「権限」をタップ</li>
                  <li>「位置情報」を「許可」に変更</li>
                </ol>
              </section>
              <section className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="font-bold text-gray-700">設定から変更する場合</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Chrome の右上「︙」メニューをタップ</li>
                  <li>「設定」をタップ</li>
                  <li>「サイトの設定」をタップ</li>
                  <li>「位置情報」をタップ</li>
                  <li>このサイト（golf-caddie-eight.vercel.app）を探して「許可」に変更</li>
                </ol>
              </section>
            </>
          )}
        </div>

        <div className="p-4 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200
                       text-gray-700 text-sm font-bold transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
