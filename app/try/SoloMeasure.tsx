"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Download, Copy, Check, X, Pencil } from "lucide-react";
import { GpsTracker } from "@/components/GpsTracker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SoloShareCard } from "@/components/SoloShareCard";
import { metersToYards } from "@/lib/distance";
import { CLUBS, CLUB_LABELS } from "@/types";
import type { Club } from "@/types";

/**
 * 登録不要のソロ飛距離計測 UI。
 *
 * - 計測は本番実績のある GpsTracker をそのまま再利用（onShotRecorded コールバック）。
 * - 結果は state に保持するだけ。DB 保存・shots insert・round_id/hole_id・event_id・
 *   ランキングは一切持たない。
 * - 「まず測って慣れる」路線のため、この計測 UI 内に登録 CTA は置かない。
 *   登録・ログイン導線は app/try/page.tsx のフッターに集約する。
 */

type State = "idle" | "measuring" | "result";

interface Result {
  distanceMeters: number;
  yards: number;
  club: Club | null;
  isNewBest: boolean;
}

// ── localStorage（DB保存なし・端末内のみ） ───────────────────────────────
// 自己ベスト1件と直近履歴（最大10件）だけを保持する。失敗しても計測体験は継続。

const BEST_KEY = "golf_caddie_try_best";
const HISTORY_KEY = "golf_caddie_try_history";
const HISTORY_MAX = 10;

interface TryRecord {
  yards: number;
  meters: number;
  club: Club | null;
  date: string; // ISO 8601
}

function loadBest(): TryRecord | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as TryRecord) : null;
  } catch {
    return null;
  }
}

function loadHistory(): TryRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TryRecord[]) : [];
  } catch {
    return [];
  }
}

function clubLabel(club: Club | null): string {
  return club ? CLUB_LABELS[club] : "番手未選択";
}

function fmtRecordDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// シェアカード用の完全日付（例: "2026/6/10"）。fmtToday と同形式。
function fmtCardDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return "";
  }
}

export function SoloMeasure() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [selectedClub, setSelectedClub] = useState<Club | "">("");
  const [best, setBest] = useState<TryRecord | null>(null);
  const [history, setHistory] = useState<TryRecord[]>([]);
  // 履歴のどの行の番手を編集中か（null＝編集なし）。
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // localStorage はクライアントのみ。初回マウントで読み込む。
  useEffect(() => {
    setBest(loadBest());
    setHistory(loadHistory());
  }, []);

  function handleRecorded(distMeters: number) {
    const yards = metersToYards(distMeters);
    const meters = Math.round(distMeters);
    const club: Club | null = selectedClub === "" ? null : selectedClub;
    const record: TryRecord = {
      yards,
      meters,
      club,
      date: new Date().toISOString(),
    };

    // 履歴：先頭に追加し最大10件で打ち切り。
    const nextHistory = [record, ...history].slice(0, HISTORY_MAX);
    setHistory(nextHistory);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      /* 保存失敗時も計測体験は継続 */
    }

    // 自己ベスト判定（ヤードで比較）。初回 or 更新時のみ保存。
    const isNewBest = !best || yards > best.yards;
    if (isNewBest) {
      setBest(record);
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(record));
      } catch {
        /* 同上 */
      }
    }

    setResult({ distanceMeters: distMeters, yards, club, isNewBest });
    setState("result");
  }

  function reset() {
    setResult(null);
    setState("idle");
  }

  // 履歴行の番手を後から付け替え。距離・日付は不変。localStorage に保存し、
  // 対象が自己ベストと同一記録（日付＋距離一致）なら自己ベストの番手も連動更新。
  function handleEditClub(index: number, newClubValue: string) {
    const target = history[index];
    if (!target) return;
    const newClub: Club | null = newClubValue === "" ? null : (newClubValue as Club);

    const nextHistory = history.map((h, i) =>
      i === index ? { ...h, club: newClub } : h
    );
    setHistory(nextHistory);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      /* 保存失敗時も表示は更新済み */
    }

    if (best && best.date === target.date && best.yards === target.yards) {
      const nextBest = { ...best, club: newClub };
      setBest(nextBest);
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(nextBest));
      } catch {
        /* 同上 */
      }
    }

    setEditingIndex(null);
  }

  // 自己ベスト常時表示バナー（記録があるときだけ）。
  const bestBanner = best ? (
    <div className="card flex items-center justify-between py-3">
      <span className="text-sm font-semibold text-green-700">🏆 自己ベスト</span>
      <span className="text-green-700">
        <span className="text-2xl font-bold tabular-nums">{best.yards}</span>
        <span className="text-sm font-bold">y</span>
        <span className="text-green-400 text-xs ml-2">
          {clubLabel(best.club)}・{fmtRecordDate(best.date)}
        </span>
      </span>
    </div>
  ) : null;

  // 直近の計測履歴リスト（最大10件）。
  const historyList =
    history.length > 0 ? (
      <div className="card">
        <h2 className="font-semibold text-green-800 mb-2 text-sm">直近の計測</h2>
        <ul className="space-y-1">
          {history.map((h, i) => (
            <li
              key={`${h.date}-${i}`}
              className="flex items-center gap-2 text-sm py-1 border-b border-green-50 last:border-0"
            >
              <span className="text-xs text-green-400 tabular-nums w-10 shrink-0">
                {fmtRecordDate(h.date)}
              </span>
              <span className="text-green-700 font-bold tabular-nums shrink-0">
                {h.yards}y
              </span>
              <span className="text-green-400 text-xs">({h.meters}m)</span>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                {editingIndex === i ? (
                  <select
                    value={h.club ?? ""}
                    onChange={(e) => handleEditClub(i, e.target.value)}
                    onBlur={() => setEditingIndex(null)}
                    className="text-xs px-1.5 py-1 rounded-lg border border-green-300 bg-white text-green-800"
                  >
                    <option value="">番手未選択</option>
                    {CLUBS.map((c) => (
                      <option key={c} value={c}>
                        {CLUB_LABELS[c]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingIndex(i)}
                    aria-label="番手を編集"
                    className="text-green-600 text-xs inline-flex items-center gap-1
                               underline decoration-dotted underline-offset-2 hover:text-green-700"
                  >
                    {clubLabel(h.club)}
                    <Pencil size={12} aria-hidden="true" />
                  </button>
                )}
                <SoloShareButton
                  variant="icon"
                  distanceYards={h.yards}
                  distanceMeters={h.meters}
                  dateLabel={fmtCardDate(h.date)}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  if (state === "measuring") {
    return (
      <div className="card">
        <GpsTracker
          onShotRecorded={(distMeters) => handleRecorded(distMeters)}
          onCancel={reset}
          recordLabel="②ボール地点で計測"
        />
      </div>
    );
  }

  if (state === "result" && result) {
    const meters = Math.round(result.distanceMeters);
    return (
      <div className="space-y-4">
        {bestBanner}

        <div className="card text-center py-8">
          {result.isNewBest && (
            <div className="inline-block mb-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
              🎉 自己ベスト更新！
            </div>
          )}
          <p className="text-sm font-semibold text-green-600">計測結果</p>
          <div className="mt-2 flex items-baseline justify-center gap-2">
            <span className="text-6xl font-bold text-green-700 tabular-nums">
              {result.yards}
            </span>
            <span className="text-2xl font-bold text-green-700">yd</span>
          </div>
          <p className="text-green-500 text-sm mt-1">
            （{meters}m）{result.club && ` ・ ${CLUB_LABELS[result.club]}`}
          </p>

          <div className="mt-6">
            <SoloShareButton distanceYards={result.yards} distanceMeters={meters} />
          </div>
          {result.isNewBest && (
            <p className="text-xs text-pink-600 mt-2 font-semibold">
              自己ベスト更新！シェアして自慢しよう
            </p>
          )}

          <button onClick={reset} className="btn-secondary mt-3 py-2 text-sm">
            もう一度計る
          </button>
        </div>

        <InstallPrompt />

        {historyList}
      </div>
    );
  }

  // idle
  return (
    <div className="space-y-4">
      {bestBanner}

      <div className="card">
        <ol className="space-y-2 text-sm text-green-800">
          <li>1. 「①打つ場所でスタート」を押して、ボールを打つ位置に立つ</li>
          <li>2. ボールの着地点まで歩く（画面の数字がリアルタイムで動きます）</li>
          <li>3. 着地点で「②ボール地点で計測」を押すと飛距離が出ます</li>
        </ol>

        {/* 番手選択（任意・未選択でも計測可） */}
        <div className="mt-4">
          <label className="block text-xs text-green-500 mb-1">番手（任意）</label>
          <select
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value as Club | "")}
            className="w-full text-sm px-3 py-2 rounded-xl border border-green-200 bg-white text-green-800"
          >
            <option value="">番手を選択しない</option>
            {CLUBS.map((c) => (
              <option key={c} value={c}>
                {CLUB_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-green-400 mt-3">
          ※ 位置情報の利用を許可してください。屋外でのご利用を推奨します。
        </p>
        <button onClick={() => setState("measuring")} className="btn-primary mt-4">
          ①打つ場所でスタート
        </button>
      </div>

      {historyList}
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
  dateLabel: dateLabelProp,
  variant = "primary",
}: {
  distanceYards: number;
  distanceMeters: number;
  // 省略時は今日の日付。履歴からのシェアでは各記録の日付を渡す。
  dateLabel?: string;
  // primary: 結果画面の大ボタン / icon: 履歴行の小アイコン。
  variant?: "primary" | "icon";
}) {
  useNotoSansJp();
  const cardRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dateLabel = dateLabelProp ?? fmtToday();

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
      {variant === "icon" ? (
        <button
          onClick={openPreview}
          aria-label="この記録をシェア"
          className="shrink-0 text-pink-600 hover:text-pink-700 active:text-pink-800 p-1"
        >
          <Share2 size={16} aria-hidden="true" />
        </button>
      ) : (
        <button
          onClick={openPreview}
          className="w-full inline-flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white font-bold py-3 rounded-xl transition-colors"
        >
          <Share2 size={18} aria-hidden="true" />
          記録をシェア
        </button>
      )}

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
