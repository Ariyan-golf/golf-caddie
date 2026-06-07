"use client";

import { useEffect, useRef, useState } from "react";
import { ShareCard } from "./ShareCard";

/**
 * 「成績をシェア」ボタン。
 *
 * 1. 画面外に <ShareCard> を実寸（1080×1350）で1枚描画しておく。
 * 2. 押下時に html-to-image でその DOM を PNG 化。
 * 3. Web Share API（navigator.share with files）で共有シートを開く。
 *    非対応（主に PC）の場合は PNG ダウンロードにフォールバック。
 */

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";

const SHARE_URL = "https://golf-caddie-eight.vercel.app/lp.html";

export interface ShareCardButtonProps {
  distanceYards: number;
  rank:          number;
  total:         number;
  categoryLabel: string;
  year:          number;
  month:         number;
  courseName:    string;
  holeNumber:    number;
  roundDate:     string;   // YYYY-MM-DD
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ja-JP");
}

/** Noto Sans JP を一度だけ <head> に読み込む。 */
function useNotoSansJp() {
  useEffect(() => {
    if (document.querySelector(`link[data-sharecard-font="1"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    link.setAttribute("data-sharecard-font", "1");
    document.head.appendChild(link);
  }, []);
}

/** 撮影前にフォントと画像が確実に読み込まれているのを待つ。 */
async function waitForAssets(node: HTMLElement) {
  // Web フォント（読めない環境ではフォールバックで継続）
  try {
    if (document.fonts) {
      await Promise.all([
        document.fonts.load("900 184px 'Noto Sans JP'"),
        document.fonts.load("700 32px 'Noto Sans JP'"),
      ]);
      await document.fonts.ready;
    }
  } catch {
    /* フォント読み込み失敗時はシステムフォントで継続 */
  }
  // 画像（ai-cut.png）
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
    ),
  );
}

export function ShareCardButton({
  distanceYards,
  rank,
  total,
  categoryLabel,
  year,
  month,
  courseName,
  holeNumber,
  roundDate,
}: ShareCardButtonProps) {
  useNotoSansJp();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const node = cardRef.current;
      if (!node) return;

      await waitForAssets(node);

      // html-to-image はクライアント専用。動的 import でバンドルを分離。
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 1,
        cacheBust: true,
        width: 1080,
        height: 1350,
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "golf-caddie-share.png", { type: "image/png" });

      const caption =
        `${courseName} で ${distanceYards}yd！ 全国${rank}位。あなたの一発は何位？\n` +
        `#GolfCaddieAI #飛ばしっこGO ${SHARE_URL}`;

      const canShareFiles =
        typeof navigator !== "undefined" &&
        !!navigator.canShare &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        try {
          await navigator.share({ files: [file], text: caption });
        } catch (err) {
          // ユーザーがシートを閉じた場合（AbortError）は無視。
          if ((err as Error)?.name !== "AbortError") {
            downloadPng(dataUrl);
          }
        }
      } else {
        // Web Share 非対応（主に PC）→ ダウンロード
        downloadPng(dataUrl);
      }
    } catch (err) {
      console.error("share card failed", err);
      setError("画像の生成に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  function downloadPng(dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "golf-caddie-share.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <button
        onClick={handleShare}
        disabled={busy}
        className="mt-4 w-full bg-pink-600 hover:bg-pink-700 active:bg-pink-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
      >
        {busy ? "画像を生成中…" : "📣 成績をシェア"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}

      {/* 画面外に実寸カードを描画（撮影対象）。aria-hidden で支援技術から隠す。 */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          width: 1080,
          height: 1350,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <ShareCard
          ref={cardRef}
          distanceYards={distanceYards}
          rank={rank}
          total={total}
          categoryLabel={categoryLabel}
          year={year}
          month={month}
          courseName={courseName}
          holeLabel={`${holeNumber}番ホール`}
          dateLabel={fmtDate(roundDate)}
        />
      </div>
    </>
  );
}
