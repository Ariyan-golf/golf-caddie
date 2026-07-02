"use client";

import { forwardRef, type CSSProperties } from "react";
import { getScoreColor } from "@/lib/scoreColor";

/**
 * ラウンド記録カード（シェア用画像の元になる DOM）。
 *
 * 飛ばしっこGO の ShareCard / ソロ計測の SoloShareCard とは独立した新規部品。
 * 既存カードは一切参照・変更しない（万一の事故を避けるため自己完結でコピー実装）。
 *
 * - variant で2種類を切替：
 *     "round"    … 今日のラウンド（スコアカード型：合計＋OUT/IN のホール別スコア表）
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

export interface RecordShareHole {
  holeNumber: number;
  par:        number;
  score:      number | null;
  putts:      number | null;
}

export interface RecordShareCardProps {
  variant:      RecordShareVariant;
  courseName:   string;
  dateLabel:    string;            // 例: "2026/6/16"
  totalScore:   number | null;     // "round" 用（未記録は null）
  distanceYards: number | null;    // "round"/"distance" 用（最長ドライバー）
  avgDriverYards?: number | null;  // "round"/"distance" 用（平均。null なら平均を出さない）
  maxDriverHole?: number | null;   // "round"/"distance" 用（最長が出たホール番号）
  holes?:       RecordShareHole[]; // "round" 用（ホール別 par / スコア）
  background:   RecordShareBackground;
}

const FONT_STACK =
  "'Noto Sans JP', system-ui, -apple-system, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, sans-serif";

const PINK = "#E5308A";
const GREEN_DARK = "#265E34";
const GREY = "#787878";
const GRADIENT = "linear-gradient(180deg, #3E7D44 0%, #76AA58 100%)";
// 写真の上に重ねる暗幕（上やや薄め→下濃いめ）。白文字の可読性を確保する。
// 白パネルを使わず写真の上に直接テキストを乗せるため、やや強めにしている。
const SCRIM = "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.65) 100%)";

export const RecordShareCard = forwardRef<HTMLDivElement, RecordShareCardProps>(
  function RecordShareCard(
    { variant, courseName, dateLabel, totalScore, distanceYards, avgDriverYards = null, maxDriverHole = null, holes = [], background },
    ref,
  ) {
    const isImage = background.type === "image";

    // ── round バリアント（スコアカード型）用の計算 ───────────────────────
    const outHoles = holes.filter((h) => h.holeNumber >= 1 && h.holeNumber <= 9);
    const inHoles = holes.filter((h) => h.holeNumber >= 10 && h.holeNumber <= 18);
    const parTotal = holes.reduce((s, h) => s + h.par, 0);
    // 合計スコアの下に出すパー差。18ホール分そろっているときのみ表示。
    const showDiff = totalScore != null && holes.length === 18;
    const diffValue = showDiff ? totalScore! - parTotal : 0;
    const diffLabel = diffValue > 0 ? `+${diffValue}` : diffValue < 0 ? `${diffValue}` : "±0";

    // スコア表の1列（OUT / IN）。罫線は白パネル前提で常に #E8E8E8。
    const LINE = "#E8E8E8";
    // パット数の通常色（白パネル前提の濃色）。null セルは GREY で「-」。
    const PUTT = "#333333";
    const scoreColumn = (label: string, rows: RecordShareHole[]) => {
      const colParSum = rows.reduce((s, r) => s + r.par, 0);
      const allScored = rows.length > 0 && rows.every((r) => r.score != null);
      const colScoreSum = rows.reduce((s, r) => s + (r.score ?? 0), 0);
      const allPutted = rows.length > 0 && rows.every((r) => r.putts != null);
      const colPuttSum = rows.reduce((s, r) => s + (r.putts ?? 0), 0);
      const th: CSSProperties = {
        fontSize: 22, fontWeight: 700, color: GREY, padding: "4px 6px",
        textAlign: "center", borderBottom: `2px solid ${LINE}`,
      };
      const td: CSSProperties = {
        fontSize: 26, fontWeight: 700, padding: "7px 6px",
        textAlign: "center", borderBottom: `1px solid ${LINE}`,
      };
      const sub: CSSProperties = {
        fontSize: 28, fontWeight: 900, color: GREEN_DARK, padding: "9px 6px",
        textAlign: "center", borderTop: `2px solid ${LINE}`,
      };
      return (
        <table style={{ width: 372, borderCollapse: "collapse", fontFamily: FONT_STACK }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>H</th>
              <th style={th}>Par</th>
              <th style={th}>計</th>
              <th style={th}>P</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.holeNumber}>
                <td style={{ ...td, color: GREY, textAlign: "left" }}>{r.holeNumber}</td>
                <td style={{ ...td, color: GREY }}>{r.par}</td>
                <td style={{ ...td, fontWeight: 900, color: r.score != null ? getScoreColor(r.score, r.par) : GREY }}>
                  {r.score != null ? r.score : "-"}
                </td>
                <td style={{ ...td, color: r.putts != null ? PUTT : GREY }}>
                  {r.putts != null ? r.putts : "-"}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...sub, textAlign: "left" }}>{label}</td>
              <td style={sub}>{colParSum}</td>
              <td style={sub}>{allScored ? colScoreSum : "-"}</td>
              <td style={sub}>{allPutted ? colPuttSum : "-"}</td>
            </tr>
          </tbody>
        </table>
      );
    };

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

        {/* round（写真時）：上下分割レイアウト。
            a. ヘッダー部（ラベル/コース名/日付/合計）は写真の上に直接（パネルなし・白文字）。
            b. スコア表のみ半透明白パネルに入れてヘッダー部の下に置く。 */}
        {variant === "round" && isImage && (
          <>
            {/* a. ヘッダー部（写真の上に直接。白文字＋影） */}
            <div
              style={{
                position: "absolute",
                top: 180,
                left: 100,
                width: 880,
                textAlign: "center",
                color: "#ffffff",
                textShadow: "0 2px 12px rgba(0,0,0,0.6)",
                zIndex: 2,
              }}
            >
              <div style={{ fontSize: 32, fontWeight: 700 }}>今日のラウンド</div>
              <div style={{ fontSize: 44, fontWeight: 900, marginTop: 8, lineHeight: 1.2, wordBreak: "break-word" }}>
                {courseName}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{dateLabel}</div>
              {totalScore != null ? (
                <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                  <span style={{ fontSize: 120, fontWeight: 900, color: "#ffffff", lineHeight: 1 }}>{totalScore}</span>
                  {showDiff && (
                    <span style={{ fontSize: 48, fontWeight: 900, color: "#ffffff", marginLeft: 20 }}>{diffLabel}</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 56, fontWeight: 900, color: "#ffffff", marginTop: 16, lineHeight: 1.2 }}>
                  スコア未記録
                </div>
              )}
            </div>

            {/* b. スコア表：半透明白パネル（ヘッダー部の下）。
                概算高さ検証：top 528 + パネル高さ 約568（内側テーブル約504 + padding上下64）
                → 下端 約1096。ピンク帯上端 約1172 に対し余白 約76px で重ならない。 */}
            <div
              style={{
                position: "absolute",
                top: 528,
                left: 100,
                width: 880,
                background: "rgba(255,255,255,0.85)",
                borderRadius: 32,
                boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
                padding: "32px 40px",
                boxSizing: "border-box",
                zIndex: 2,
              }}
            >
              <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
                {scoreColumn("OUT", outHoles)}
                {scoreColumn("IN", inHoles)}
              </div>
            </div>
          </>
        )}

        {/* round（写真なし）：従来どおり1枚の白パネルにヘッダー＋表をまとめる。 */}
        {variant === "round" && !isImage && (
          <div
            style={{
              position: "absolute",
              top: 180,
              left: 100,
              width: 880,
              background: "#ffffff",
              borderRadius: 40,
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: "44px 48px 52px",
              boxSizing: "border-box",
              textAlign: "center",
              zIndex: 2,
            }}
          >
            {/* a. 上部：ラベル・コース名・日付 */}
            <div style={{ fontSize: 32, fontWeight: 700, color: GREY }}>今日のラウンド</div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: GREEN_DARK,
                marginTop: 8,
                lineHeight: 1.2,
                wordBreak: "break-word",
              }}
            >
              {courseName}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: GREY, marginTop: 6 }}>{dateLabel}</div>

            {/* b. 合計スコア＋パー差 */}
            {totalScore != null ? (
              <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                <span style={{ fontSize: 120, fontWeight: 900, color: PINK, lineHeight: 1 }}>{totalScore}</span>
                {showDiff && (
                  <span style={{ fontSize: 48, fontWeight: 900, color: GREY, marginLeft: 20 }}>{diffLabel}</span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 56, fontWeight: 900, color: GREY, marginTop: 16, lineHeight: 1.2 }}>
                スコア未記録
              </div>
            )}

            {/* c. スコア表：OUT / IN 横並び（スコアカードはスコアに専念。飛距離は distance タブの役割） */}
            <div style={{ marginTop: 20, display: "flex", gap: 24, justifyContent: "center" }}>
              {scoreColumn("OUT", outHoles)}
              {scoreColumn("IN", inHoles)}
            </div>
          </div>
        )}

        {/* distance バリアント（変更なし）。写真なしは白パネル、写真時はパネルなし＋白文字。 */}
        {variant === "distance" && (
          <div
            style={{
              position: "absolute",
              top: 400,
              left: 100,
              width: 880,
              background: isImage ? "transparent" : "#ffffff",
              borderRadius: isImage ? 0 : 40,
              boxShadow: isImage ? "none" : "0 24px 60px rgba(0,0,0,0.25)",
              padding: "64px 64px 72px",
              boxSizing: "border-box",
              textAlign: "center",
              textShadow: isImage ? "0 2px 12px rgba(0,0,0,0.6)" : undefined,
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: isImage ? "#ffffff" : GREY }}>
              {avgDriverYards != null ? "ドライバー飛距離" : "ドライバー最長飛距離"}
            </div>

              {/* 主役：最長 */}
              <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                <span style={{ fontSize: 184, fontWeight: 900, color: isImage ? "#ffffff" : GREEN_DARK, lineHeight: 1 }}>
                  {distanceYards ?? 0}
                </span>
                <span style={{ fontSize: 64, fontWeight: 900, color: isImage ? "#ffffff" : GREEN_DARK, marginLeft: 12 }}>yd</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: isImage ? "#ffffff" : GREY, marginTop: 8 }}>
                {maxDriverHole != null ? `最長（${maxDriverHole}番ホール）` : "最長"}
              </div>

              {/* サブ：平均（記録があるときのみ） */}
              {avgDriverYards != null && (
                <div style={{ marginTop: 24, display: "flex", alignItems: "baseline", justifyContent: "center" }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: isImage ? "#ffffff" : GREY, marginRight: 12 }}>平均</span>
                  <span style={{ fontSize: 72, fontWeight: 900, color: PINK, lineHeight: 1 }}>
                    {avgDriverYards}
                  </span>
                  <span style={{ fontSize: 32, fontWeight: 900, color: PINK, marginLeft: 8 }}>y</span>
                </div>
              )}

              {/* 区切り線 */}
              <div style={{ height: 2, background: isImage ? "rgba(255,255,255,0.5)" : "#E8E8E8", margin: "44px 8px" }} />

              <div style={{ fontSize: 36, fontWeight: 700, color: isImage ? "#ffffff" : GREEN_DARK, wordBreak: "break-word" }}>
                {courseName}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: isImage ? "#ffffff" : GREY, marginTop: 14 }}>
                {dateLabel}
              </div>
          </div>
        )}

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
