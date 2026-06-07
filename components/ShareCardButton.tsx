"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Download, Copy, Check, X } from "lucide-react";
import { ShareCard } from "./ShareCard";

/**
 * 「記録をシェア」ボタン → カードのプレビュー（モーダル）→ 3アクション。
 *
 * 1. 「記録をシェア」を押すとオーバーレイでカードのプレビューを表示。
 * 2. プレビュー内の3ボタン：
 *    ① シェアする     … html-to-image で PNG 化 → Web Share（非対応PCはDLにフォールバック）
 *    ② 画像を保存     … PNG を端末にダウンロード
 *    ③ キャプションをコピー … 共有キャプションをクリップボードへ
 * 3. × でプレビューを閉じる。
 *
 * 撮影対象の <ShareCard> はプレビュー内に実寸（1080×1350）で描画し、
 * 表示用に親を transform:scale で縮小する（撮影は実寸ノードを対象にする）。
 */

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";

const SHARE_URL = "https://golf-caddie-eight.vercel.app/lp.html";

// プレビュー表示サイズ（実寸 1080×1350 を 0.25 倍）。
const PREVIEW_SCALE = 0.25;

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function buildCaption() {
    return (
      `本日の記録｜${courseName} ドライバー${distanceYards}yd（飛ばしっこGO 全国${rank}位）\n` +
      `あなたの一発は何位？\n` +
      `#GolfCaddieAI #飛ばしっこGO\n` +
      `${SHARE_URL}`
    );
  }

  function openPreview() {
    setError(null);
    setCopied(false);
    setPreviewOpen(true);
  }

  function closePreview() {
    if (busy) return; // 生成中は閉じさせない
    setPreviewOpen(false);
    setError(null);
    setCopied(false);
  }

  /** カード DOM を PNG 化して dataUrl と File を返す（①②で共用）。 */
  async function generatePng(): Promise<{ dataUrl: string; file: File }> {
    const node = cardRef.current;
    if (!node) throw new Error("card node not mounted");
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
    return { dataUrl, file };
  }

  function downloadPng(dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "golf-caddie-share.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ① シェアする（Web Share、非対応はDLフォールバック）
  async function handleShareAction() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { dataUrl, file } = await generatePng();
      const caption = buildCaption();
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

  // ② 画像を保存（常にダウンロード）
  async function handleSaveImage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { dataUrl } = await generatePng();
      downloadPng(dataUrl);
    } catch (err) {
      console.error("save image failed", err);
      setError("画像の生成に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  // ③ キャプションをコピー
  async function handleCopyCaption() {
    setError(null);
    try {
      await navigator.clipboard.writeText(buildCaption());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  }

  return (
    <>
      <button
        onClick={openPreview}
        className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold py-3 rounded-xl transition-colors"
      >
        <Share2 size={18} aria-hidden="true" />
        記録をシェア
      </button>

      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="記録カードのプレビュー"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* 背景 */}
          <div className="absolute inset-0 bg-black/50" onClick={closePreview} />

          {/* パネル */}
          <div className="relative z-10 w-full max-w-xs bg-white rounded-2xl shadow-xl p-4">
            <button
              onClick={closePreview}
              aria-label="閉じる"
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 p-1"
              disabled={busy}
            >
              <X size={20} />
            </button>

            {/* カードプレビュー（実寸を transform で縮小表示） */}
            <div className="flex justify-center mt-3 mb-4">
              <div
                style={{
                  width: 1080 * PREVIEW_SCALE,
                  height: 1350 * PREVIEW_SCALE,
                  overflow: "hidden",
                  borderRadius: 16,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 1080,
                    height: 1350,
                    transform: `scale(${PREVIEW_SCALE})`,
                    transformOrigin: "top left",
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
              </div>
            </div>

            {/* 3アクション */}
            <div className="space-y-2">
              <button
                onClick={handleShareAction}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                <Share2 size={16} aria-hidden="true" />
                シェアする
              </button>

              <button
                onClick={handleSaveImage}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-white border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                <Download size={16} aria-hidden="true" />
                画像を保存
              </button>

              <button
                onClick={handleCopyCaption}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {copied ? (
                  <>
                    <Check size={16} aria-hidden="true" />
                    コピーしました
                  </>
                ) : (
                  <>
                    <Copy size={16} aria-hidden="true" />
                    キャプションをコピー
                  </>
                )}
              </button>
            </div>

            {busy && (
              <p className="text-xs text-center text-gray-500 mt-3">画像を生成中…</p>
            )}
            {error && (
              <p className="text-xs text-red-600 mt-2 text-center">{error}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
