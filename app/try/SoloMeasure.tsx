"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Share2, Download, Copy, Check, X } from "lucide-react";
import { GpsTracker } from "@/components/GpsTracker";
import { SoloShareCard } from "@/components/SoloShareCard";
import { metersToYards } from "@/lib/distance";

/**
 * 登録不要のソロ飛距離計測 UI。
 *
 * - 計測は本番実績のある GpsTracker をそのまま再利用（onShotRecorded コールバック）。
 * - 結果は state に保持するだけ。DB 保存・shots insert・round_id/hole_id・event_id・
 *   ランキングは一切持たない。
 * - すべての CTA は /register に向ける（(app) 配下へは直リンクしない）。
 */

type State = "idle" | "measuring" | "result";

interface Result {
  distanceMeters: number;
}

export function SoloMeasure() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<Result | null>(null);

  function handleRecorded(distMeters: number) {
    setResult({ distanceMeters: distMeters });
    setState("result");
  }

  function reset() {
    setResult(null);
    setState("idle");
  }

  if (state === "measuring") {
    return (
      <div className="card">
        <GpsTracker
          onShotRecorded={(distMeters) => handleRecorded(distMeters)}
          onCancel={reset}
        />
      </div>
    );
  }

  if (state === "result" && result) {
    const yards = metersToYards(result.distanceMeters);
    const meters = Math.round(result.distanceMeters);
    return (
      <div className="space-y-4">
        <div className="card text-center py-8">
          <p className="text-sm font-semibold text-green-600">計測結果</p>
          <div className="mt-2 flex items-baseline justify-center gap-2">
            <span className="text-6xl font-bold text-green-700 tabular-nums">{yards}</span>
            <span className="text-2xl font-bold text-green-700">yd</span>
          </div>
          <p className="text-green-500 text-sm mt-1">（{meters}m）</p>

          <div className="mt-6">
            <SoloShareButton distanceYards={yards} distanceMeters={meters} />
          </div>

          <button onClick={reset} className="btn-secondary mt-3 py-2 text-sm">
            もう一度計る
          </button>
        </div>

        <div className="card text-center py-6 border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
          <p className="text-amber-800 font-semibold">記録を残して、番手アドバイスも受けよう</p>
          <Link
            href="/register"
            className="inline-block mt-3 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          >
            無料で会員登録
          </Link>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-4">
      <div className="card">
        <ol className="space-y-2 text-sm text-green-800">
          <li>1. 「計測スタート」を押して、ボールを打つ位置に立つ</li>
          <li>2. ボールの着地点まで歩く（画面の数字がリアルタイムで動きます）</li>
          <li>3. 着地点で「着地点を記録」を押すと飛距離が出ます</li>
        </ol>
        <p className="text-xs text-green-400 mt-3">
          ※ 位置情報の利用を許可してください。屋外でのご利用を推奨します。
        </p>
        <button onClick={() => setState("measuring")} className="btn-primary mt-4">
          計測スタート
        </button>
      </div>

      <div className="card text-center py-6 border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
        <p className="text-amber-800 font-semibold">記録の保存・履歴・番手アドバイスは会員機能です</p>
        <Link
          href="/register"
          className="inline-block mt-3 text-sm font-bold text-amber-700 underline"
        >
          無料で会員登録
        </Link>
      </div>
    </div>
  );
}

// ── ソロ用シェアボタン（ShareCardButton のロジックを薄くラップ） ──────────
//
// 画像生成（html-to-image）/ Web Share / ダウンロード / キャプションコピーは
// 既存 ShareCardButton と同じ手順。撮影対象を SoloShareCard に差し替えただけ。

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";

const SHARE_URL = "https://golf-caddie-eight.vercel.app/try";

// プレビュー表示サイズ（実寸 1080×1350 を 0.25 倍）。
const PREVIEW_SCALE = 0.25;

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

function fmtToday() {
  return new Date().toLocaleDateString("ja-JP");
}

function SoloShareButton({
  distanceYards,
  distanceMeters,
}: {
  distanceYards: number;
  distanceMeters: number;
}) {
  useNotoSansJp();
  const cardRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dateLabel = fmtToday();

  function buildCaption() {
    return (
      `登録不要で飛距離を測ってみた｜ドライバー${distanceYards}yd（${distanceMeters}m）\n` +
      `あなたも一発測ってみよう！\n` +
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
    if (busy) return;
    setPreviewOpen(false);
    setError(null);
    setCopied(false);
  }

  async function generatePng(): Promise<{ dataUrl: string; file: File }> {
    const node = cardRef.current;
    if (!node) throw new Error("card node not mounted");
    await waitForAssets(node);
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(node, {
      pixelRatio: 1,
      cacheBust: true,
      width: 1080,
      height: 1350,
    });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "golf-caddie-try.png", { type: "image/png" });
    return { dataUrl, file };
  }

  function downloadPng(dataUrl: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "golf-caddie-try.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

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
          if ((err as Error)?.name !== "AbortError") {
            downloadPng(dataUrl);
          }
        }
      } else {
        downloadPng(dataUrl);
      }
    } catch (err) {
      console.error("solo share card failed", err);
      setError("画像の生成に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveImage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { dataUrl } = await generatePng();
      downloadPng(dataUrl);
    } catch (err) {
      console.error("solo save image failed", err);
      setError("画像の生成に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

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
        className="w-full inline-flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold py-3 rounded-xl transition-colors"
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
          <div className="absolute inset-0 bg-black/50" onClick={closePreview} />

          <div className="relative z-10 w-full max-w-xs bg-white rounded-2xl shadow-xl p-4">
            <button
              onClick={closePreview}
              aria-label="閉じる"
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 disabled:opacity-40 p-1"
              disabled={busy}
            >
              <X size={20} />
            </button>

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
                  <SoloShareCard
                    ref={cardRef}
                    distanceYards={distanceYards}
                    distanceMeters={distanceMeters}
                    dateLabel={dateLabel}
                  />
                </div>
              </div>
            </div>

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
