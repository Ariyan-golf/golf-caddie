"use client";

import { forwardRef } from "react";
import { CLUB_LABELS, type Club } from "@/types";

/**
 * 個別ショット記録カード（シェア用画像の元になる DOM）。
 *
 * 既存の RecordShareCard / ShareCard / SoloShareCard とは独立した新規部品。
 * 既存カードは一切参照・変更しない（自己完結コピー実装）。
 *
 * - 実寸 1080×1350（縦4:5）でレンダリングし、html-to-image でそのまま PNG 化する。
 * - 画面には出さず、呼び出し元（ShotShareButton）が画面外に1枚だけ描画して撮影する。
 * - フォント埋め込みの都合上、スタイルはすべてインライン（Tailwind に依存しない）。
 * - 背景は prop で切替できる構造（既定は緑グラデ）。今回は緑グラデのみ使用。
 *   写真背景・キャラ画像は後から差し込めるよう image バリアントと暗幕処理を残してある。
 */

export type ShotShareBackground =
  | { type: "gradient" }
  | { type: "image"; dataUrl: string };

export interface ShotShareCardProps {
  club:           string;          // 番手コード（CLUB_LABELS で表示変換）
  courseName:     string;
  holeNumber:     number | null;
  distanceYards:  number | null;
  distanceMeters: number | null;
  dateLabel:      string;          // 例 "2026/6/16"
  background?:    ShotShareBackground;
}

const FONT_STACK =
  "'Noto Sans JP', system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

// 色定数は RecordShareCard.tsx と揃える。
const PINK = "#E5308A";
const GREEN_DARK = "#265E34";
const GREY = "#787878";
const GRADIENT = "linear-gradient(180deg, #3E7D44 0%, #76AA58 100%)";
// 写真背景時に白文字の可読性を確保する暗幕（今回は未使用だが将来用に保持）。
const SCRIM = "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)";

export const ShotShareCard = forwardRef<HTMLDivElement, ShotShareCardProps>(
  function ShotShareCard(
    {
      club,
      courseName,
      holeNumber,
      distanceYards,
      distanceMeters,
      dateLabel,
      background = { type: "gradient" },
    },
    ref,
  ) {
    const isImage = background.type === "image";
    const clubLabel = CLUB_LABELS[club as Club] ?? club;
    const metaLine = [courseName, holeNumber != null ? `H${holeNumber}` : null]
      .filter(Boolean)
      .join("　");

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
        {/* 背景写真（指定時のみ）＋暗幕。今回は使用しないが将来差し込み用に保持。 */}
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

        {/* 左上ロゴ（RecordShareCard と同じ） */}
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
          {/* 番手 */}
          <div style={{ fontSize: 40, fontWeight: 900, color: GREEN_DARK }}>
            {clubLabel}
          </div>

          {/* 飛距離（ヤード）大 */}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 184, fontWeight: 900, color: PINK, lineHeight: 1 }}>
              {distanceYards ?? 0}
            </span>
            <span style={{ fontSize: 64, fontWeight: 900, color: PINK, marginLeft: 12 }}>y</span>
          </div>

          {/* 飛距離（メートル）サブ */}
          {distanceMeters != null && (
            <div style={{ fontSize: 40, fontWeight: 700, color: GREY, marginTop: 12 }}>
              {Math.round(distanceMeters)}m
            </div>
          )}

          {/* 区切り線 */}
          <div style={{ height: 2, background: "#E8E8E8", margin: "44px 8px" }} />

          {/* コース名＋ホール */}
          {metaLine && (
            <div
              style={{
                fontSize: 36,
                fontWeight: 700,
                color: GREEN_DARK,
                wordBreak: "break-word",
              }}
            >
              {metaLine}
            </div>
          )}
          <div style={{ fontSize: 30, fontWeight: 700, color: GREY, marginTop: 14 }}>
            {dateLabel}
          </div>
        </div>

        {/* 下の帯（RecordShareCard と同じ流儀） */}
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
            飛んだ一球、記録してます。
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#ffffff", opacity: 0.95, marginTop: 12 }}>
            #GolfCaddieAI&nbsp;&nbsp;@golfcaddie_ai2026
          </div>
        </div>
      </div>
    );
  },
);
