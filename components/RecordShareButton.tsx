"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Download, Copy, Check, X, ImagePlus, RotateCcw } from "lucide-react";
import {
  RecordShareCard,
  type RecordShareVariant,
  type RecordShareBackground,
} from "./RecordShareCard";

/**
 * ラウンド結果画面からの「記録カード」シェアボタン（飛ばしっこGO ランキング非依存）。
 *
 * 画像生成（html-to-image の toPng）/ Web Share / ダウンロード / キャプションコピーの
 * 手順は既存 ShareCardButton と同じ流儀を、自己完結の新規部品としてコピー実装している。
 * 既存の ShareCard / ShareCardButton / SoloShareCard / SoloMeasure には一切依存しない。
 *
 * プレビューモーダルで：
 *   (a) カード種類①今日のラウンド ②ドライバー飛距離 を選択（②は記録が無ければ無効）
 *   (b)「背景写真を選ぶ」で端末の写真を選び、写真背景＋暗幕に切替（「写真を外す」で緑グラデへ）
 *   (c) シェアする / 画像を保存 / キャプションをコピー
 */

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";

const SHARE_URL = "https://golf-caddie-eight.vercel.app/lp.html";

// プレビュー表示サイズ（実寸 1080×1350 を 0.25 倍）。
const PREVIEW_SCALE = 0.25;

export interface RecordShareButtonProps {
  courseName:     string;
  roundDate:      string;          // YYYY-MM-DD
  totalScore:     number | null;
  maxDriverYards: number | null;   // そのラウンドの最長ドライバー飛距離（無ければ null）
  avgDriverYards: number | null;   // そのラウンドのドライバー平均（無ければ null）
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

/** dataURL の画像を1枚プリロードして読み込み完了を待つ（背景写真用）。 */
function preloadImage(dataUrl: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

/** 撮影前にフォントと画像（DOM内の img ＋ 背景写真）が確実に読み込まれているのを待つ。 */
async function waitForAssets(node: HTMLElement, bgDataUrl: string | null) {
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
  // 背景写真（CSS background-image で使うため、明示的にプリロードして待つ）
  if (bgDataUrl) {
    await preloadImage(bgDataUrl);
  }
  // 念のため DOM 内の <img> も待つ（現状この新規カードには無いが安全側で）
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

export function RecordShareButton({
  courseName,
  roundDate,
  totalScore,
  maxDriverYards,
  avgDriverYards,
}: RecordShareButtonProps) {
  useNotoSansJp();
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [variant, setVariant] = useState<RecordShareVariant>("round");
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasDriver = maxDriverYards != null;

  const background: RecordShareBackground = bgDataUrl
    ? { type: "image", dataUrl: bgDataUrl }
    : { type: "gradient" };

  function buildCaption() {
    // 記録・成長トーン（自慢色は控えめ）。
    if (variant === "distance" && maxDriverYards != null) {
      const distancePart =
        avgDriverYards != null
          ? `最長${maxDriverYards}y / 平均${avgDriverYards}y`
          : `最長 ${maxDriverYards}yd`;
      return (
        `本日のドライバー ${distancePart}｜${courseName}\n` +
        `コツコツ記録更新中。\n` +
        `#GolfCaddieAI\n` +
        `${SHARE_URL}`
      );
    }
    const scorePart = totalScore != null ? ` ${totalScore}打` : "";
    return (
      `本日のラウンド｜${courseName}${scorePart}\n` +
      `一打ずつ、前へ。記録を残してます。\n` +
      `#GolfCaddieAI\n` +
      `${SHARE_URL}`
    );
  }

  function openPreview() {
    setError(null);
    setCopied(false);
    setVariant("round");
    setPreviewOpen(true);
  }

  function closePreview() {
    if (busy) return; // 生成中は閉じさせない
    setPreviewOpen(false);
    setError(null);
    setCopied(false);
  }

  function onPickBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを選び直せるようにリセット
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setBgDataUrl(reader.result);
    };
    reader.onerror = () => setError("画像の読み込みに失敗しました。");
    reader.readAsDataURL(file);
  }

  /** カード DOM を PNG 化して dataUrl と File を返す。 */
  async function generatePng(): Promise<{ dataUrl: string; file: File }> {
    const node = cardRef.current;
    if (!node) throw new Error("card node not mounted");
    await waitForAssets(node, bgDataUrl);
    // html-to-image はクライアント専用。動的 import でバンドルを分離。
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(node, {
      pixelRatio: 1,
      cacheBust: true,
      width: 1080,
      height: 1350,
    });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "golf-caddie-record.png", { type: "image/png" });
    return { dataUrl, file };
  }

  function downloadPng(dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "golf-caddie-record.png";
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
      console.error("record share card failed", err);
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
      console.error("save record image failed", err);
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
        className="inline-flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold py-2 px-4 rounded-xl transition-colors text-sm"
      >
        <Share2 size={16} aria-hidden="true" />
        シェア
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
          <div className="relative z-10 w-full max-w-xs bg-white rounded-2xl shadow-xl p-4 max-h-[92vh] overflow-y-auto">
            <button
              onClick={closePreview}
              aria-label="閉じる"
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 p-1"
              disabled={busy}
            >
              <X size={20} />
            </button>

            {/* カード種類の選択 */}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVariant("round")}
                className={`py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
                  variant === "round"
                    ? "bg-green-600 border-green-600 text-white"
                    : "bg-white border-green-200 text-green-700"
                }`}
              >
                今日のラウンド
              </button>
              <button
                type="button"
                onClick={() => hasDriver && setVariant("distance")}
                disabled={!hasDriver}
                className={`py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${
                  !hasDriver
                    ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed"
                    : variant === "distance"
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-white border-green-200 text-green-700"
                }`}
              >
                ドライバー飛距離
              </button>
            </div>
            {!hasDriver && (
              <p className="mt-1 text-[11px] text-gray-400 text-center">
                このラウンドにはドライバー飛距離の記録がありません
              </p>
            )}

            {/* カードプレビュー（実寸を transform で縮小表示） */}
            <div className="flex justify-center mt-3 mb-3">
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
                  <RecordShareCard
                    ref={cardRef}
                    variant={variant}
                    courseName={courseName}
                    dateLabel={fmtDate(roundDate)}
                    totalScore={totalScore}
                    distanceYards={maxDriverYards}
                    avgDriverYards={avgDriverYards}
                    background={background}
                  />
                </div>
              </div>
            </div>

            {/* 背景写真の選択 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickBackground}
            />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 bg-white border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 text-xs font-semibold py-2 rounded-xl transition-colors"
              >
                <ImagePlus size={15} aria-hidden="true" />
                背景写真を選ぶ
              </button>
              <button
                type="button"
                onClick={() => setBgDataUrl(null)}
                disabled={busy || !bgDataUrl}
                className="inline-flex items-center justify-center gap-1.5 bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 text-xs font-semibold py-2 rounded-xl transition-colors"
              >
                <RotateCcw size={15} aria-hidden="true" />
                写真を外す
              </button>
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
