"use client";

import { forwardRef } from "react";

/**
 * ラウンド記録カード（シェア用画像の元になる DOM）。
 *
 * 飛ばしっこGO の ShareCard / ソロ計測の SoloShareCard とは独立した新規部品。
 * 既存カードは一切参照・変更しない（万一の事故を避けるため自己完結でコピー実装）。
 *
 * - variant で2種類を切替：
 *     "round"    … 今日のラウンド（コース名・日付・スコア合計）
 *     "distance" … そのラウンドの最長ドライバー飛距離（順位は出さない）
 * - 実寸 1080×1350（縦4:5）でレンダリングし、html-to-image でそのまま PNG 化する。
 * - 画面には出さず、呼び出し元（RecordShareButton）が画面外に1枚だけ描画して撮影する。
 * - フォント埋め込みの都合上、スタイルはすべてインライン（Tailwind に依存しない）。
 * - 背景は prop で切替：
 *     既定は緑グラデ。画像 dataURL を渡すと写真背景＋暗幕（白文字が読めるように）。
 */

export type RecordShareVariant = "round" | "distance";

export type RecordShareBackground =
  | { type: "gradient" }
  | { type: "image"; dataUrl: string };

export interface RecordShareCardProps {
  variant:      RecordShareVariant;
  courseName:   string;
  dateLabel:    string;            // 例: "2026/6/16"
  totalScore:   number | null;     // "round" 用（未記録は null）
  distanceYards: number | null;    // "distance" 用（最長ドライバー）
  avgDriverYards?: number | null;  // "distance" 用（平均。null なら平均行を出さない）
  background:   RecordShareBackground;
}

const FONT_STACK =
  "'Noto Sans JP', system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

const PINK = "#E5308A";
const GREEN_DARK = "#265E34";
const GREY = "#787878";
const GRADIENT = "linear-gradient(180deg, #3E7D44 0%, #76AA58 100%)";
// 写真の上に重ねる暗幕（上やや薄め→下濃いめ）。白文字の可読性を確保する。
const SCRIM = "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)";

export const RecordShareCard = forwardRef<HTMLDivElement, RecordShareCardProps>(
  function RecordShareCard(
    { variant, courseName, dateLabel, totalScore, distanceYards, avgDriverYards = null, background },
    ref,
  ) {
    const isImage = background.type === "image";

    return (
      <div
        ref={ref}
        style={{
          position: "relative",
          width: 1080,
          height: 1350,
          background: isImage ? "#1d3a22" : GRADIENT,
          fontFamily: FONT_STACK,
          color: "#ffffff",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        {/* 背景写真（指定時のみ）＋暗幕 */}
        {isImage && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `url(${background.dataUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                zIndex: 0,
              }}
            />
            <div style={{ position: "absolute", inset: 0, background: SCRIM, zIndex: 1 }} />
          </>
        )}

        {/* 左上ロゴ */}
        <div style={{ position: "absolute", top: 64, left: 64, zIndex: 2 }}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: 2 }}>GCA</div>
          <div style={{ fontSize: 27, fontWeight: 700, opacity: 0.92, marginTop: 8 }}>
            Golf Caddie AI
          </div>
        </div>

        {/* 白い角丸パネル（中央） */}
        <div
          style={{
            position: "absolute",
            top: 400,
            left: 100,
            width: 880,
            background: "#ffffff",
            borderRadius: 40,
            boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
            padding: "64px 64px 72px",
            boxSizing: "border-box",
            textAlign: "center",
            zIndex: 2,
          }}
        >
          {variant === "round" ? (
            <>
              <div style={{ fontSize: 32, fontWeight: 700, color: GREY }}>
                今日のラウンド
              </div>

              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  color: GREEN_DARK,
                  marginTop: 20,
                  lineHeight: 1.25,
                  wordBreak: "break-word",
                }}
              >
                {courseName}
              </div>

              {/* 区切り線 */}
              <div style={{ height: 2, background: "#E8E8E8", margin: "44px 8px" }} />

              {totalScore != null ? (
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                  <span style={{ fontSize: 160, fontWeight: 900, color: PINK, lineHeight: 1 }}>
                    {totalScore}
                  </span>
                  <span style={{ fontSize: 56, fontWeight: 900, color: PINK, marginLeft: 12 }}>打</span>
                </div>
              ) : (
                <div style={{ fontSize: 56, fontWeight: 900, color: GREY, lineHeight: 1.2 }}>
                  スコア未記録
                </div>
              )}

              <div style={{ fontSize: 32, fontWeight: 700, color: GREY, marginTop: 28 }}>
                {dateLabel}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, fontWeight: 700, color: GREY }}>
                {avgDriverYards != null ? "ドライバー飛距離" : "ドライバー最長飛距離"}
              </div>

              {/* 主役：最長 */}
              <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                <span style={{ fontSize: 184, fontWeight: 900, color: GREEN_DARK, lineHeight: 1 }}>
                  {distanceYards ?? 0}
                </span>
                <span style={{ fontSize: 64, fontWeight: 900, color: GREEN_DARK, marginLeft: 12 }}>yd</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: GREY, marginTop: 8 }}>最長</div>

              {/* サブ：平均（記録があるときのみ） */}
              {avgDriverYards != null && (
                <div style={{ marginTop: 24, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: GREY, marginRight: 12 }}>平均</span>
                  <span style={{ fontSize: 72, fontWeight: 900, color: PINK, lineHeight: 1 }}>
                    {avgDriverYards}
                  </span>
                  <span style={{ fontSize: 32, fontWeight: 900, color: PINK, marginLeft: 8 }}>y</span>
                </div>
              )}

              {/* 区切り線 */}
              <div style={{ height: 2, background: "#E8E8E8", margin: "44px 8px" }} />

              <div style={{ fontSize: 36, fontWeight: 700, color: GREEN_DARK, wordBreak: "break-word" }}>
                {courseName}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: GREY, marginTop: 14 }}>
                {dateLabel}
              </div>
            </>
          )}
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
            #GolfCaddieAI&nbsp;&nbsp;@golfcaddie_ai2026
          </div>
        </div>
      </div>
    );
  },
);
