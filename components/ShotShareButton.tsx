"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Download, Copy, Check, X } from "lucide-react";
import { CLUB_LABELS, type Club } from "@/types";
import { ShotShareCard } from "./ShotShareCard";

/**
 * 個別ショットの「記録カード」シェアボタン（最シンプル版）。
 *
 * 画像生成（html-to-image の toPng）/ Web Share / ダウンロード / キャプションコピーの
 * 手順は既存 RecordShareButton と同じ流儀を、自己完結の新規部品としてコピー実装している。
 * 既存の RecordShareButton / RecordShareCard / ShareCard 等には一切依存しない。
 *
 * 「最近のショット」各行に置く小さなトリガー（Share2 アイコン）→ プレビューモーダルで
 *   シェアする / 画像を保存 / キャプションをコピー の3アクション。
 * 写真背景・キャラ画像・カード種類切替は今回は持たない（後で追加する前提）。
 */

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";

const SHARE_URL = "https://golf-caddie-eight.vercel.app/try";

// プレビュー表示サイズ（実寸 1080×1350 を 0.25 倍）。
const PREVIEW_SCALE = 0.25;

export interface ShotShareButtonProps {
  club:           string;          // 番手コード
  courseName:     string;
  holeNumber:     number | null;
  distanceYards:  number | null;
  distanceMeters: number | null;
  date:           string;          // YYYY-MM-DD など Date が解釈できる文字列
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

/** 撮影前にフォントと DOM 内の画像が確実に読み込まれているのを待つ。 */
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
  // DOM 内の <img>（現状この最シンプル版には無いが、将来のキャラ画像用に安全側で）
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  );
}

export function ShotShareButton({
  club,
  courseName,
  holeNumber,
  distanceYards,
  distanceMeters,
  date,
}: ShotShareButtonProps) {
  useNotoSansJp();
  const cardRef = useRef<HTMLDivElement>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function buildCaption() {
    const clubLabel = CLUB_LABELS[club as Club] ?? club;
    const holePart = holeNumber != null ? ` H${holeNumber}` : "";
    const metersPart = distanceMeters != null ? `（${Math.round(distanceMeters)}m）` : "";
    const yards = distanceYards ?? 0;
    return (
      `${courseName}${holePart} で ${yards}y${metersPart}｜${clubLabel}\n` +
      `飛んだ一球、記録してます。\n` +
      `#GolfCaddieAI\n` +
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

  /** カード DOM を PNG 化して dataUrl と File を返す。 */
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
    const file = new File([blob], "golf-caddie-shot.png", { type: "image/png" });
    return { dataUrl, file };
  }

  function downloadPng(dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "golf-caddie-shot.png";
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
      console.error("shot share card failed", err);
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
      console.error("save shot image failed", err);
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
        aria-label="このショットをシェア"
        className="inline-flex items-center justify-center text-green-600 hover:text-green-800 hover:bg-green-50 active:bg-green-100 rounded-lg p-1.5 transition-colors shrink-0"
      >
        <Share2 size={16} aria-hidden="true" />
      </button>

      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ショットカードのプレビュー"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* 背景 */}
          <div className="absolute inset-0 bg-black/50" onClick={closePreview} />

          {/* パネル */}
          <div className="relative z-10 w-full max-w-xs bg-white rounded-2xl shadow-xl p-4 max-h-[92vh] overflow-y-auto">
            <button
              onClick={closePreview}
              aria-label="閉じる"
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 p-1"
              disabled={busy}
            >
              <X size={20} />
            </button>

            {/* カードプレビュー（実寸を transform で縮小表示） */}
            <div className="flex justify-center mt-6 mb-3">
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
                  <ShotShareCard
                    ref={cardRef}
                    club={club}
                    courseName={courseName}
                    holeNumber={holeNumber}
                    distanceYards={distanceYards}
                    distanceMeters={distanceMeters}
                    dateLabel={fmtDate(date)}
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
