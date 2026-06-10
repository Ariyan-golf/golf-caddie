"use client";

import { forwardRef } from "react";

/**
 * ソロ飛距離計測の自慢カード（シェア用画像の元になる DOM）。
 *
 * ShareCard（飛ばしっこGO用）をコピー元に、全国順位・total・イベントピル・
 * categoryLabel を削除した「登録不要のソロ計測」専用版。
 * 表示は「飛距離(yd/m)・日付・AIちゃん・帯CTA」のみ。
 *
 * - 実寸 1080×1350（縦4:5）でレンダリングし、html-to-image でそのまま PNG 化する。
 * - 画面には出さず、呼び出し元（SoloShareCardButton）が画面外に1枚だけ描画して撮影する。
 * - フォント埋め込みの都合上、スタイルはすべてインライン（Tailwind に依存しない）。
 * - フォントは Noto Sans JP（700/900）。読み込みは呼び出し元で行う。
 */

export interface SoloShareCardProps {
  distanceYards:  number;
  distanceMeters: number;
  dateLabel:      string;   // 例: "2026/6/10"
}

const FONT_STACK =
  "'Noto Sans JP', system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

const PINK = "#E5308A";
const GREEN_DARK = "#265E34";
const GREY = "#787878";

export const SoloShareCard = forwardRef<HTMLDivElement, SoloShareCardProps>(function SoloShareCard(
  { distanceYards, distanceMeters, dateLabel },
  ref,
) {
  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        width: 1080,
        height: 1350,
        background: `linear-gradient(180deg, #3E7D44 0%, #76AA58 100%)`,
        fontFamily: FONT_STACK,
        color: "#ffffff",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* 左上ロゴ */}
      <div style={{ position: "absolute", top: 64, left: 64 }}>
        <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: 2 }}>GCA</div>
        <div style={{ fontSize: 27, fontWeight: 700, opacity: 0.92, marginTop: 8 }}>
          Golf Caddie AI
        </div>
      </div>

      {/* 白い角丸パネル */}
      <div
        style={{
          position: "absolute",
          top: 360,
          left: 100,
          width: 880,
          background: "#ffffff",
          borderRadius: 40,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          padding: "56px 64px 64px",
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700, color: GREY }}>
          わたしの飛距離
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ fontSize: 184, fontWeight: 900, color: GREEN_DARK, lineHeight: 1 }}>
            {distanceYards}
          </span>
          <span style={{ fontSize: 64, fontWeight: 900, color: GREEN_DARK, marginLeft: 12 }}>yd</span>
        </div>

        <div style={{ fontSize: 40, fontWeight: 700, color: GREY, marginTop: 20 }}>
          （{distanceMeters}m）
        </div>

        {/* 区切り線 */}
        <div style={{ height: 2, background: "#E8E8E8", margin: "44px 8px" }} />

        <div style={{ fontSize: 32, fontWeight: 700, color: GREY }}>
          {dateLabel}
        </div>
      </div>

      {/* AIちゃん（右下） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/characters/ai-cut.png"
        alt=""
        style={{
          position: "absolute",
          right: 24,
          bottom: 168,
          height: 440,
          width: "auto",
          objectFit: "contain",
          zIndex: 2,
        }}
      />

      {/* 下の帯 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: PINK,
          textAlign: "center",
          padding: "34px 24px 38px",
          boxSizing: "border-box",
          zIndex: 3,
        }}
      >
        <div style={{ fontSize: 46, fontWeight: 900, color: "#ffffff" }}>
          登録不要で飛距離を測ろう
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#ffffff", opacity: 0.95, marginTop: 12 }}>
          golf-caddie-eight.vercel.app/try
        </div>
      </div>
    </div>
  );
});
