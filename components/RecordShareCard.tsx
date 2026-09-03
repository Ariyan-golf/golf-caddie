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
  showDistance?: boolean;          // "round" 用（true のとき飛距離行を表示。既定 false）
  holes?:       RecordShareHole[]; // "round" 用（ホール別 par / スコア）
  background:   RecordShareBackground;
  backgroundOffset?: { x: number; y: number }; // 背景写真の表示位置オフセット（%、-50〜50）。ドラッグ調整用。未指定は中央
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
    { variant, courseName, dateLabel, totalScore, distanceYards, avgDriverYards = null, maxDriverHole = null, showDistance = false, holes = [], background, backgroundOffset = { x: 0, y: 0 } },
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
        fontSize: 22, fontWeight: 700, color: GREY, padding: "2px 6px",
        textAlign: "center", borderBottom: `2px solid ${LINE}`,
      };
      const td: CSSProperties = {
        fontSize: 26, fontWeight: 700, padding: "4px 6px",
        textAlign: "center", borderBottom: `1px solid ${LINE}`,
      };
      const sub: CSSProperties = {
        fontSize: 28, fontWeight: 900, color: GREEN_DARK, padding: "5px 6px",
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
                backgroundPosition: `${50 + backgroundOffset.x}% ${50 + backgroundOffset.y}%`,
                zIndex: 0,
              }}
            />
            {/* 暗幕：distance は従来の SCRIM。round は下部情報帯だけで可読性が取れるため上端を弱める。 */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  variant === "round"
                    ? "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.05) 45%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%)"
                    : SCRIM,
                zIndex: 1,
              }}
            />
          </>
        )}

        {/* 左上ロゴ */}
        <div style={{ position: "absolute", top: 64, left: 64, zIndex: 2 }}>
          <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: 2 }}>GCA</div>
          <div style={{ fontSize: 27, fontWeight: 700, opacity: 0.92, marginTop: 8 }}>
            Golf Caddie AI
          </div>
        </div>

        {/* round（写真時）：白パネルを廃止し、写真に直接文字を重ねるレイアウト。
            テキストコンテナは bottom:190 固定・上方向自動伸長（ピンク帯上端 約1180 の手前で止める）。 */}
        {variant === "round" && isImage && (() => {
          // OUT / IN 小計（各ナイン全ホール入力済みのときのみ数値）。
          const outScored = outHoles.length > 0 && outHoles.every((h) => h.score != null);
          const inScored = inHoles.length > 0 && inHoles.every((h) => h.score != null);
          const outSum = outHoles.reduce((s, h) => s + (h.score ?? 0), 0);
          const inSum = inHoles.reduce((s, h) => s + (h.score ?? 0), 0);
          // パット小計（各ナイン全ホール putts 入力済みのときのみ数値）。
          const outPutted = outHoles.length > 0 && outHoles.every((h) => h.putts != null);
          const inPutted = inHoles.length > 0 && inHoles.every((h) => h.putts != null);
          const outPuttSum = outHoles.reduce((s, h) => s + (h.putts ?? 0), 0);
          const inPuttSum = inHoles.reduce((s, h) => s + (h.putts ?? 0), 0);
          // 合計パット（18ホール全部に putts が入っているときのみ）。新規 prop は追加せず holes から算出する。
          const allPutted = holes.length === 18 && holes.every((h) => h.putts != null);
          const totalPutts = allPutted ? outPuttSum + inPuttSum : null;
          // 18ホール帯用にホール番号で引けるようにする。
          const holeByNumber = new Map<number, RecordShareHole>(holes.map((h) => [h.holeNumber, h]));

          // 写真背景では黒・濃紺が沈んで見えにくいため、getScoreColor の判定結果はそのまま使い、
          // 視認性が低い2色（パー＝黒／ダブルボギー以上＝濃紺）だけ明るい色に置き換える。
          const scoreColorOnPhoto = (score: number, par: number) => {
            const base = getScoreColor(score, par);
            if (base === "#000000") return "#ffffff";
            if (base === "#1A237E") return "#7FA8FF";
            return base;
          };
          // 写真の上でも読める文字色（濃色の GREY / GREEN_DARK はここでは使わない）。
          const TEXT_MAIN = "#ffffff";
          const TEXT_SUB = "#E4E4E4";
          const ACCENT_GREEN = "#9BE8A8";

          return (
            <div
              style={{
                position: "absolute",
                left: 64,
                right: 64,
                bottom: 190,
                zIndex: 2,
                textAlign: "center",
              }}
            >
              {/* a. 1行目：左＝日付・コース名（2段）／右＝合計スコア＋合計パット */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", textAlign: "left" }}>
                <div style={{ flex: 1, minWidth: 0, marginRight: 24 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: TEXT_SUB }}>{dateLabel}</div>
                  <div
                    style={{
                      fontSize: 34,
                      fontWeight: 900,
                      color: TEXT_MAIN,
                      marginTop: 4,
                      lineHeight: 1.15,
                      wordBreak: "break-word",
                    }}
                  >
                    {courseName}
                  </div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", alignItems: "baseline" }}>
                  {totalScore != null ? (
                    <>
                      <span style={{ fontSize: 88, fontWeight: 900, color: PINK, lineHeight: 1 }}>{totalScore}</span>
                      {totalPutts != null && (
                        <span style={{ fontSize: 26, fontWeight: 700, color: TEXT_SUB, marginLeft: 10 }}>
                          パット{totalPutts}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 40, fontWeight: 900, color: TEXT_SUB }}>スコア未記録</span>
                  )}
                </div>
              </div>

              {/* b. 2行目：OUT / IN 横並び（それぞれスコアとパット） */}
              <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 48 }}>
                {[
                  { label: "OUT", scored: outScored, sum: outSum, putted: outPutted, puttSum: outPuttSum },
                  { label: "IN", scored: inScored, sum: inSum, putted: inPutted, puttSum: inPuttSum },
                ].map((col) => (
                  <div key={col.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TEXT_SUB }}>{col.label}</div>
                    <div style={{ fontSize: 44, fontWeight: 900, color: TEXT_MAIN, lineHeight: 1 }}>
                      {col.scored ? col.sum : "-"}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: TEXT_SUB, marginTop: 2 }}>
                      {col.putted ? `パット${col.puttSum}` : "-"}
                    </div>
                  </div>
                ))}
              </div>

              {/* c. 3行目：18ホールのスコアを1行の細い帯で表示（ホール番号を小さく添え、スコアはパットなしで表示） */}
              <div style={{ marginTop: 20, display: "flex" }}>
                {Array.from({ length: 18 }, (_, i) => i + 1).map((n) => {
                  const h = holeByNumber.get(n);
                  const sc = h?.score ?? null;
                  return (
                    <div key={n} style={{ width: `${100 / 18}%` }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_SUB }}>{n}</div>
                      <div
                        style={{
                          marginTop: 1,
                          fontSize: 23,
                          fontWeight: 900,
                          lineHeight: 1.2,
                          color: sc != null ? scoreColorOnPhoto(sc, h!.par) : TEXT_SUB,
                        }}
                      >
                        {sc != null ? sc : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* d. 4行目：飛距離行（showDistance トグル ON かつ記録があるときのみ） */}
              {showDistance && distanceYards != null && (
                <div style={{ marginTop: 14, fontSize: 26, fontWeight: 700, color: TEXT_SUB }}>
                  🏌 ドライバー{" "}
                  {avgDriverYards != null && (
                    <span style={{ fontWeight: 900, color: PINK }}>平均{avgDriverYards}y</span>
                  )}
                  {avgDriverYards != null && " / "}
                  <span style={{ fontWeight: 900, color: ACCENT_GREEN }}>最長{distanceYards}y</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* round（写真なし）：従来どおり1枚の白パネルにヘッダー＋表をまとめる。 */}
        {variant === "round" && !isImage && (
          <div
            style={{
              position: "absolute",
              top: 130,
              left: 100,
              width: 880,
              background: "#ffffff",
              borderRadius: 40,
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              padding: "36px 48px 36px",
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

            {/* d. 飛距離行（showDistance トグル ON かつ記録があるときのみ。スコアの主役性を損なわない控えめサイズ） */}
            {showDistance && distanceYards != null && (
              <div style={{ marginTop: 14, fontSize: 26, fontWeight: 700, color: GREY }}>
                🏌 ドライバー{" "}
                {avgDriverYards != null && (
                  <span style={{ fontWeight: 900, color: PINK }}>平均{avgDriverYards}y</span>
                )}
                {avgDriverYards != null && " / "}
                <span style={{ fontWeight: 900, color: GREEN_DARK }}>最長{distanceYards}y</span>
              </div>
            )}
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
