"use client";

import { forwardRef } from "react";

/**
 * 飛ばしっこGO 自慢カード（シェア用画像の元になる DOM）。
 *
 * - 実寸 1080×1350（縦4:5）でレンダリングし、html-to-image でそのまま PNG 化する。
 * - 画面には出さず、呼び出し元（ShareCardButton）が画面外に1枚だけ描画して撮影する。
 * - フォント埋め込みの都合上、スタイルはすべてインライン（Tailwind に依存しない）。
 * - フォントは Noto Sans JP（700/900）。読み込みは ShareCardButton 側で行う。
 */

export interface ShareCardProps {
  distanceYards: number;
  rank:          number;
  total:         number;
  categoryLabel: string;
  year:          number;
  month:         number;
  courseName:    string;
  holeLabel:     string;   // 例: "5番ホール"
  dateLabel:     string;   // 例: "2026/6/7"
}

const FONT_STACK =
  "'Noto Sans JP', system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

const PINK = "#E5308A";
const GREEN_DARK = "#265E34";
const GREY = "#787878";

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(function ShareCard(
  { distanceYards, rank, total, categoryLabel, year, month, courseName, holeLabel, dateLabel },
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

      {/* 右上ピル */}
      <div
        style={{
          position: "absolute",
          top: 72,
          right: 64,
          background: PINK,
          color: "#ffffff",
          fontSize: 30,
          fontWeight: 700,
          padding: "16px 34px",
          borderRadius: 9999,
          whiteSpace: "nowrap",
        }}
      >
        飛ばしっこGO {year}年{month}度
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
          ドライバー最長飛距離
        </div>

        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
          <span style={{ fontSize: 184, fontWeight: 900, color: GREEN_DARK, lineHeight: 1 }}>
            {distanceYards}
          </span>
          <span style={{ fontSize: 64, fontWeight: 900, color: GREEN_DARK, marginLeft: 12 }}>yd</span>
        </div>

        {/* 区切り線 */}
        <div style={{ height: 2, background: "#E8E8E8", margin: "44px 8px" }} />

        <div style={{ fontSize: 90, fontWeight: 900, color: PINK, lineHeight: 1 }}>
          全国 {rank}位
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: GREY, marginTop: 18 }}>
          {categoryLabel} ・ 全国 {total}人中
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

      {/* 文脈行（コース｜ホール｜日付）— 帯の上 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 210,
          textAlign: "center",
          fontSize: 30,
          fontWeight: 700,
          color: "#ffffff",
          opacity: 0.95,
          padding: "0 360px 0 48px",
          boxSizing: "border-box",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          zIndex: 1,
        }}
      >
        {courseName} ｜ {holeLabel} ｜ {dateLabel}
      </div>

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
          次のラウンドが、もっと楽しくなる。
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#ffffff", opacity: 0.95, marginTop: 12 }}>
          #GolfCaddieAI&nbsp;&nbsp;#飛ばしっこGO&nbsp;&nbsp;@golfcaddie_ai2026
        </div>
      </div>
    </div>
  );
});
