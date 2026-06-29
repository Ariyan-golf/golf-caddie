"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShotRecorder } from "./ShotRecorder";
import type { Club } from "@/types";
import { CLUBS, CLUB_LABELS } from "@/types";
import { calculateDistance, metersToYards } from "@/lib/distance";
import { stopGpsTracking, getBestShotPosition, startShotWatch, stopShotWatch, awaitHighAccuracyFix, getShotWatchTimeoutMs, type GpsPoint } from "@/lib/gps";
import { acquireWakeLock, releaseWakeLock, softReleaseWakeLock } from "@/lib/wakeLock";
import { isBetaMode } from "@/lib/betaMode";
import { putHole, putShot, putScoreUpdate, putShotUpdate, putRoundUpdate, putShotDistance } from "@/lib/offline/db";
import { saveActiveRound, clearActiveRound, readActiveRound, type ActiveRoundSnapshot } from "@/lib/activeRound";
import Link from "next/link";
import { GpsIndicator } from "./GpsIndicator";
import { CompactCompass } from "./CompactCompass";

// ── Local types ─────────────────────────────────────────────────────

interface Shot {
  id: string;
  shot_number: number;
  club: string | null;
  distance_yards: number | null;
  lie_type: string | null;
  ball_shape: string | null;
  ball_direction: string | null;
  start_lat: number | null;
  start_lng: number | null;
}

interface Hole {
  id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  penalties: number | null;
  shots: Shot[];
}

interface CourseHole {
  hole_number: number;
  par: number;
}

interface HoleRecorderProps {
  roundId: string;
  initialHoles: Hole[];
  startHole?: number;
  mode?: "shot" | "score";
  windDirection?: string | null;
  windSpeed?: string | null;
  courseRating?: number | null;
  slopeRating?: number | null;
  courseHoles?: CourseHole[];
  paymentStatus?: "pending" | "paid";
  golfCourseName?: string;
  inputMode?: "post_round" | "realtime";
  golfCourseId?: string | null;
  greenType?: "main" | "sub";
  initialGreenCenters?: Record<number, { lat: number; lng: number }>;
  pastView?: boolean;
  roundDate?: string;
  avgDriverYards?: number | null;
  maxDriverYards?: number | null;
}

interface RoundShotEntry {
  holeNumber: number;
  club: string;
  yards: number;
  meters: number;
}

interface LastShotMemo {
  holeNumber: number;
  shotNumber: number;
  distanceYards: number;
  distanceMeters: number;
}

type Phase = "par_select" | "shooting" | "putt_select" | "score_entry";

// ── Helpers ──────────────────────────────────────────────────────────

const WOOD_CLUBS:  Club[] = ["1w", "3w", "5w", "7w", "9w"];
const UTIL_CLUBS:  Club[] = ["u2", "u3", "u4", "u5", "u6", "u7"];
const IRON_CLUBS:  Club[] = ["2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i"];
const WEDGE_CLUBS: Club[] = ["pw", "aw", "gw", "sw", "lw"];

// Ball shape (球筋): 7 values per spec — incl. mishits トップ/チョロ
export const BALL_SHAPE_OPTIONS = [
  "フック", "ドロー", "ストレート", "フェード", "スライス", "トップ", "チョロ",
] as const;
export const BALL_SHAPE_SHORT: Record<string, string> = {
  "フック": "フック", "ドロー": "ドロー", "ストレート": "ST",
  "フェード": "フェード", "スライス": "スライス", "トップ": "トップ", "チョロ": "チョロ",
};

// Ball direction (左右): 3 values, separate from ball_shape
export const BALL_DIRECTION_OPTIONS = ["左", "真っ直ぐ", "右"] as const;

// ── Lie: 2-stage system ──────────────────────────────────────────────

const LIE_S1 = ["fairway", "right", "left", "short", "over"] as const;
type LieS1 = typeof LIE_S1[number];
const LIE_S1_LABEL: Record<LieS1, string> = {
  fairway: "FW", right: "右", left: "左", short: "ショート", over: "オーバー",
};

const LIE_S2 = ["ob", "penalty", "bunker", "rough"] as const;
type LieS2 = typeof LIE_S2[number];
const LIE_S2_LABEL: Record<LieS2, string> = {
  ob: "OB", penalty: "ペナ", bunker: "バンカー", rough: "ラフ",
};

// Legacy lie_type values from old system
const LEGACY_LIE_SHORT: Record<string, string> = {
  tee: "T", fw: "FW", rough: "RF", ob: "OB", bunker: "BK", trees: "林", green: "GR", other: "他",
};

function lieLabelShort(lieType: string | null): string {
  if (!lieType) return "ライ";
  if (lieType === "fairway") return "FW";
  const parts = lieType.split(":");
  if (parts.length >= 2) {
    const [s1, s2, count] = parts;
    const s1label = LIE_S1_LABEL[s1 as LieS1] ?? s1;
    const s2label = LIE_S2_LABEL[s2 as LieS2] ?? s2;
    return count ? `${s1label}${s2label}×${count}` : `${s1label}${s2label}`;
  }
  return LEGACY_LIE_SHORT[lieType] ?? lieType;
}

function parseLieParts(lieType: string | null): { s1: LieS1 | null; s2: LieS2 | null; count: number | null } {
  if (!lieType) return { s1: null, s2: null, count: null };
  const parts = lieType.split(":");
  const s1 = LIE_S1.includes(parts[0] as LieS1) ? (parts[0] as LieS1) : null;
  const s2 = parts[1] && LIE_S2.includes(parts[1] as LieS2) ? (parts[1] as LieS2) : null;
  const count = parts[2] ? parseInt(parts[2]) : null;
  return { s1, s2, count };
}

function scoreLabel(score: number, par: number) {
  const d = score - par;
  if (d <= -2) return { text: `${score} (イーグル)`, cls: "bg-yellow-100 text-yellow-700" };
  if (d === -1) return { text: `${score} (バーディ)`, cls: "bg-red-100 text-red-600" };
  if (d === 0)  return { text: `${score} (パー)`,     cls: "bg-green-100 text-green-700" };
  if (d === 1)  return { text: `${score} (ボギー)`,   cls: "bg-blue-100 text-blue-600" };
  if (d === 2)  return { text: `${score} (ダブル)`,   cls: "bg-purple-100 text-purple-600" };
  return { text: `${score} (+${d})`, cls: "bg-gray-100 text-gray-600" };
}

// スコアカード「計」の文字色をパーとの差で決定。未入力(null)は既存色のまま（呼び出し側で未適用）。
function getScoreColor(total: number | null, par: number): string {
  if (total === null || total === undefined) return "inherit";
  const diff = total - par;
  if (diff <= -2) return "#FFD700"; // イーグル以上：金
  if (diff === -1) return "#E53935"; // バーディー：赤
  if (diff === 0) return "#000000"; // パー：黒
  if (diff === 1) return "#1E88E5"; // ボギー：青
  return "#1A237E"; // ダブルボギー以上：濃い青
}

// 先回り（pre-guard）方式の中核。通信を投げる前にこれで圏外判定し、true なら
// Supabase/API を一切呼ばず直接ローカルバッファ（lib/offline/db.ts）へ書く。
// 機内モードで通信が走ると iOS が「データにアクセスするには…」ダイアログを出すため、
// 通信前にここで止めるのが目的。判定ロジックはこの1関数に集約する。
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// Supabase の insert/upsert は通信失敗時、例外を throw するか {error} を返すか
// 環境依存。ここでは「圏外（navigator.onLine === false）」または message が
// ネットワーク系のときだけ true を返し、それ以外（RLS/CHECK/FK 等のDBエラー）は
// false＝従来どおりのエラー表示に流す。引数は supabase の error オブジェクト・
// 例外・文字列いずれも受け付ける。pre-guard をすり抜けた「オンライン中の瞬断」用の
// 事後フォールバックとして残す。
function isNetworkFailure(errOrException: unknown): boolean {
  if (isOffline()) return true;
  const msg =
    errOrException instanceof Error
      ? errOrException.message
      : errOrException && typeof errOrException === "object" && "message" in errOrException
        ? String((errOrException as { message: unknown }).message)
        : String(errOrException ?? "");
  return /Failed to fetch|NetworkError|Load failed/i.test(msg);
}

// 進行中ラウンドの端末スナップショット（snap）を、サーバー値(server)へ補完する。
// サーバーがまだ持たない（圏外で未同期の）打数/パットだけを埋め、サーバーに値が
// あればサーバー優先で上書きしない。snap が無ければ server をそのまま返す。
// useState 初期化子で同期的に呼び、復元時の画面ちらつきを防ぐ（D）。
function mergeRestoredHoles(server: Hole[], snap: ActiveRoundSnapshot | null): Hole[] {
  if (!snap) return server;
  return server.map((h) => {
    const s = snap.holes.find((x) => x.hole_number === h.hole_number);
    if (!s) return h;
    const score = h.score === null && s.score != null ? s.score : h.score;
    const putts = h.putts === null && s.putts != null ? s.putts : h.putts;
    return score === h.score && putts === h.putts ? h : { ...h, score, putts };
  });
}

// ── Main component ──────────────────────────────────────────────────

export function HoleRecorder({ roundId, initialHoles, startHole = 1, mode = "shot", windDirection, windSpeed, courseRating, slopeRating, courseHoles, paymentStatus = "paid", golfCourseName = "", inputMode = "post_round", golfCourseId = null, greenType = "main", initialGreenCenters = {}, pastView = false, roundDate = "", avgDriverYards = null, maxDriverYards = null }: HoleRecorderProps) {
  const betaMode = isBetaMode();
  const router = useRouter();

  // iPhone Safari は電池低下・画面スリープ・アプリ切替でページを破棄する。
  // その際 React state は消えるため、進行中ラウンドを端末に保存し、起動時に
  // 復元して「最初のホールに戻る」事故を防ぐ。サーバー値(initialHoles)へ未同期の
  // 打数/パットを補完し、現在ホール番号も引き継ぐ。過去ラウンド閲覧(pastView)では
  // 復元しない。マージは useState 初期化子で同期的に行い、画面はちらつかせない（D）。
  const [restoredSnapshot] = useState<ActiveRoundSnapshot | null>(() =>
    pastView ? null : readActiveRound(roundId)
  );
  const mergedInitialHoles = mergeRestoredHoles(initialHoles, restoredSnapshot);

  const lastHole = mergedInitialHoles.at(-1);
  const initPhase: Phase =
    mergedInitialHoles.length === 0 ? "par_select" :
    lastHole?.score !== null  ? "par_select" :
    mode === "score"          ? "score_entry" :
                                "shooting";

  const [holes, setHoles]           = useState<Hole[]>(mergedInitialHoles);

  // コース後付け設定 → router.refresh() で新しい par を持つ initialHoles が来たら、
  // 表示中ホールの par をサーバー値へ追従させる。id で対応付け、par 以外は触らない。
  // （initialHoles の参照はサーバー再描画時のみ変わるため、通常操作中は発火しない）
  useEffect(() => {
    setHoles((prev) =>
      prev.map((h) => {
        const fresh = initialHoles.find((ih) => ih.id === h.id);
        return fresh && fresh.par !== h.par ? { ...h, par: fresh.par } : h;
      })
    );
  }, [initialHoles]);
  const [phase, setPhase]           = useState<Phase>(initPhase);
  const [holeMode, setHoleMode]     = useState<"shot" | "score">(mode);
  const [creating, setCreating]     = useState(false);
  const [expandedHole, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; type: "club" | "lie" | "shape" } | null>(null);
  const [confirmGoBack, setConfirmGoBack] = useState(false);
  const [goingBack, setGoingBack]   = useState(false);
  const [penalties, setPenalties]   = useState(0);
  const [roundShotHistory, setRoundShotHistory] = useState<RoundShotEntry[]>([]);
  // 過去ラウンド閲覧 (?view=past) では「お疲れ様」画面をスキップして
  // 直接スコアカード (RoundComplete) を表示する。
  const [roundEndConfirmed, setRoundEndConfirmed] = useState(pastView);
  const [handicapDiff, setHandicapDiff] = useState<number | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  // 連打ガード：再レンダ前の同フレーム連打で二重決済リクエストが飛ばないよう、
  // 同期的に判定できる ref を使う。
  const payProcessingRef = useRef(false);
  // 二重請求防止トークン：決済モーダルが開くたびに1つ生成し、閉じたら破棄する。
  // 同じ試行のやり直し（連打・決済画面から戻っての再押下）では同じトークンを使い回し、
  // API 側で冪等キーになる。再度モーダルを開けば新しいトークンになり別ラウンドの支払いは通る。
  const paymentTokenRef = useRef<string>("");
  useEffect(() => {
    paymentTokenRef.current = showPaymentModal ? crypto.randomUUID() : "";
  }, [showPaymentModal]);
  const [confirmEarlyEnd, setConfirmEarlyEnd] = useState(false);
  const [endedEarly, setEndedEarly] = useState(false);
  const [showBetaModal, setShowBetaModal] = useState(false);

  // ── Step 2-1 unified-screen state ───────────────────────────────────
  const [currentHoleNumber, setCurrentHoleNumber] = useState<number>(() =>
    // 復元時はスナップショットの現在ホール番号を優先（続きから表示）。
    restoredSnapshot?.currentHoleNumber ??
    mergedInitialHoles.find((h) => h.score === null)?.hole_number ??
    mergedInitialHoles.at(-1)?.hole_number ??
    startHole
  );
  const [dmStart, setDmStart] = useState<{ lat: number; lng: number } | null>(null);
  const [dmEnd, setDmEnd] = useState<{ lat: number; lng: number } | null>(null);
  const [dmDistance, setDmDistance] = useState<{ yards: number; meters: number } | null>(null);
  const [dmLoading, setDmLoading] = useState<"idle" | "start" | "end">("idle");
  const [shotNextAction, setShotNextAction] = useState<"before" | "after">("before");
  const [confirmingShot, setConfirmingShot] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [shotMode, setShotMode] = useState<"idle" | "recording">("idle");
  const [lastShot, setLastShot] = useState<LastShotMemo | null>(null);

  // B/C: shotMode を ref に追従させ、idle タイマーや visibilitychange の
  // コールバックから「今計測中か」を最新値で参照できるようにする（クロージャ陳腐化回避）。
  const shotModeRef = useRef<"idle" | "recording">("idle");
  useEffect(() => {
    shotModeRef.current = shotMode;
  }, [shotMode]);

  // 「打つ前」押下後2秒間はGPS精度安定化のために startPosition を確定させない
  // GPS精度±14mの状態で startPosition を記録すると、その後の位置取得との
  // 直線距離計算で 8〜14m の誤差が初期値として出てしまうため
  // 2秒待機して GPS が安定した位置を起点とすることで、正確な飛距離を測定する
  const shotStartGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestShotPositionRef  = useRef<GpsPoint | null>(null);
  const startPositionRef       = useRef<{ lat: number; lng: number } | null>(null);
  const startReadyRef          = useRef<boolean>(false);

  // Per-hole green direction (absolute heading 0-359°). Keyed by hole number;
  // automatically "cleared" on hole switch because the key just isn't present yet
  // for the next hole. Lives in component state only — resets on app reload by design.
  const [greenDirections, setGreenDirections] = useState<Record<number, number>>({});

  // Per-hole green-center coordinates, seeded from any rows that already exist
  // in green_centers for this course + green_type. New registrations from the
  // dialog merge into this map.
  const [greenCenters, setGreenCenters] = useState<Record<number, { lat: number; lng: number }>>(initialGreenCenters);

  // コース後付け設定 → router.refresh() で新しい green_centers を持つ
  // initialGreenCenters が来たら state を同期する（par 再同期と同型）。
  // greenCenters はプレー中にユーザーが編集する一時状態ではない（登録ダイアログは
  // 休眠）ため丸ごと置き換えてよい。initialGreenCenters の参照はサーバー再描画時のみ
  // 変わるため、通常操作中は発火しない。
  useEffect(() => {
    setGreenCenters(initialGreenCenters);
  }, [initialGreenCenters]);

  // 残り距離測定（C8b Min版）。green_centers と現在GPS位置の Haversine 距離。
  // 「打つ前/止まった場所」ペアとは独立した単発GPS取得（手動オンデマンド・電池影響ゼロ）。
  // ホール切替時に破棄して新ホール用に再計測を促す（selectHole 参照）。
  const [remainingDistance, setRemainingDistance] = useState<{
    holeNumber: number;
    yards: number;
    meters: number;
  } | null>(null);
  const [remainingDistanceLoading, setRemainingDistanceLoading] = useState(false);
  const [remainingDistanceError, setRemainingDistanceError] = useState<string | null>(null);

  // Green-center registration dialog + toast
  const [greenDialogOpen, setGreenDialogOpen] = useState(false);
  const [greenDialogStatus, setGreenDialogStatus] = useState<"idle" | "saving" | "error">("idle");
  const [greenDialogError, setGreenDialogError] = useState<string | null>(null);
  const [greenToast, setGreenToast] = useState<{ holeNumber: number } | null>(null);

  // 15分タイムアウト発火時に表示するトースト。3秒で自動消滅。
  const [shotTimeoutToast, setShotTimeoutToast] = useState<string | null>(null);

  // ラウンド中フィードバック：1W記録直後の暫定順位トースト（複数コンペ対応で配列）。5秒で自動消滅。
  const [draconRankToasts, setDraconRankToasts] = useState<string[]>([]);

  // Wind compass visibility — persisted to localStorage
  // 方位センサーは稼働中ずっと電力を消費し、イベント毎の再描画もCPUを使う。
  // 風向き・方向を見たい時だけONにし、それ以外はリスナーを解除して電池を温存する。
  // そのためデフォルトはOFF。前回ON/OFFした設定が localStorage にあれば尊重する
  // （前回ONなら今回もON）。OFF中は CompactCompass が useDeviceOrientation(visible)
  // を通じて deviceorientation リスナーを実際に解除する＝センサー停止＆再描画なし。
  const [windVisible, setWindVisible] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem(COMPASS_STORAGE_KEY);
    if (stored !== null) setWindVisible(stored === "true");
  }, []);
  useEffect(() => {
    localStorage.setItem(COMPASS_STORAGE_KEY, String(windVisible));
  }, [windVisible]);

  // iPhone Safari は電池低下・画面スリープ・アプリ切替でページを破棄する。
  // その際 React state は消えるため、進行中ラウンドを端末に保存し、起動時に
  // 復元して「最初のホールに戻る」事故を防ぐ。
  // ホール移動／打数・パット入力のたびに holes / currentHoleNumber が変わって発火し、
  // 現在ホール番号・全ホールの打数とパットを丸ごと保存する（A）。
  // 過去閲覧(pastView)と終了確定後(roundEndConfirmed)は保存しない（C と整合）。
  useEffect(() => {
    if (pastView || roundEndConfirmed) return;
    saveActiveRound({
      roundId,
      courseName: golfCourseName,
      date: roundDate,
      currentHoleNumber,
      holes: holes.map((h) => ({
        id: h.id,
        hole_number: h.hole_number,
        score: h.score,
        putts: h.putts,
      })),
      updatedAt: Date.now(),
    });
  }, [holes, currentHoleNumber, roundEndConfirmed, pastView, roundId, golfCourseName, roundDate]);

  const currentHole  = holes.find((h) => h.hole_number === currentHoleNumber) ?? null;
  const holeCardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // 「次のホール →」用。ScoreTable と同じ周回順（startHole 起点）を再現し、
  // 現在ホールの「次」と「最終ホールか」を求める。最終ホールでは null（ボタン非活性）。
  const playOrder = Array.from({ length: 18 }, (_, i) => ((startHole - 1 + i) % 18) + 1);
  const currentPlayIdx = playOrder.indexOf(currentHoleNumber);
  const nextHoleNum =
    currentPlayIdx === -1 || currentPlayIdx === playOrder.length - 1
      ? null
      : playOrder[currentPlayIdx + 1];

  function scrollToHole(holeNumber: number) {
    const hole = holes.find((h) => h.hole_number === holeNumber);
    if (!hole) return;
    if (hole.score !== null) {
      holeCardRefs.current[holeNumber]?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const completedHoles = holes.filter((h) => h.score !== null);
  const totalScore     = completedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
  const totalPar       = completedHoles.reduce((s, h) => s + h.par, 0);
  const isRoundDone    = holes.length === 18 && holes.every((h) => h.score !== null);

  // Cleanup when round finishes — GPS is released by ShotRecorder unmount
  useEffect(() => {
    if (!isRoundDone) return;
    localStorage.removeItem(COMPASS_STORAGE_KEY);
  }, [isRoundDone]);

  // 「打つ前」を押した位置から現在位置までの直線距離（Haversine公式）。
  // カート経路に依存しない純粋な飛距離測定 — ゴルファーの興奮ポイント
  // （飛距離確認）に直結。watchPosition は handleShotStart で開き、
  // handleShotEnd / handleCancelShot / handleConfirmShot / 15分タイムアウト
  // で閉じる pair-scoped 設計（lib/gps.ts: startShotWatch を参照）。
  // ライブ更新は startShotWatch の onUpdate コールバックから setDmDistance
  // を直接呼ぶので、ここでは setInterval ベースの useEffect は持たない。

  // Component unmount 時に watch と2秒待機タイマーが漏れないよう保険を掛ける。
  useEffect(() => {
    return () => {
      clearShotStartGraceTimer();
      stopShotWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A: バックグラウンドでページが破棄→再読込されたとき、保存済みの計測途中状態
  // （始点・shotMode）を復元する。今読み込んでいる round / hole が一致し、かつ
  // startedAt から15分以内（既存 resolveShotTimeoutMs と同じ猶予）のときだけ復元。
  // 条件に合わなければ（別round / 別hole / 期限切れ）キーを削除して復元しない。
  // マウント時に一度だけ実行。
  useEffect(() => {
    const inflight = readDmInflight();
    if (!inflight) return;

    const sameRound = inflight.roundId === roundId;
    const sameHole = inflight.holeNumber === currentHoleNumber;
    const withinWindow = Date.now() - inflight.startedAt <= getShotWatchTimeoutMs();

    if (!sameRound || !sameHole || !withinWindow) {
      clearDmInflight();
      return;
    }

    // 始点確定済みの状態に戻す（復元後は2秒猶予は不要なので startReadyRef を立てる）。
    startPositionRef.current = inflight.start;
    startReadyRef.current = true;
    latestShotPositionRef.current = null;
    setDmStart(inflight.start);
    setDmEnd(null);
    setDmDistance({ yards: 0, meters: 0 });
    setShotNextAction("after");
    setShotMode("recording");

    // 計測を続けられるよう GPS監視と Wake Lock を張り直す。
    // 二重 watch は startShotWatch 内の再入ガード、Wake Lock 二重取得は
    // lib/wakeLock の tryAcquire ガードが防ぐ。
    beginShotWatch();
    void acquireWakeLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // C: 画面が再表示されたとき、計測中ならバックグラウンドで止まっている可能性の
  // ある GPS監視を張り直し、Wake Lock を取り直して計測を継続できる状態にする。
  // ページ自体の再読込は A の復元が担当。ここは「ページは生存しているが
  // バックグラウンドで watch が止まった」取りこぼしを拾う。
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (shotModeRef.current !== "recording") return;
      if (!startReadyRef.current || !startPositionRef.current) return;
      // startShotWatch 内の再入ガードで重複 watch にはならない。
      beginShotWatch();
      void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Wake Lock 無操作オートオフ（発熱・電池消耗対策）──────────────────
  // ラウンド画面で WAKE_LOCK_IDLE_MS 無操作になったら Wake Lock を「ソフト解除」
  // して画面スリープを許可（食事・組待ち中の発熱と電池消耗を止める）。
  // 操作が戻れば取り直す。画面が一度スリープ→再点灯した場合は lib/wakeLock の
  // visibilitychange 再取得が担当し、tryAcquire の二重取得ガードで競合しない。
  // ラウンド終了（roundEndConfirmed）後は監視を畳む（リーク防止）。
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeSoftReleasedRef = useRef(false);

  useEffect(() => {
    if (roundEndConfirmed) return;
    if (typeof window === "undefined") return;

    const armTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        // GPS安定化中（「打つ前」押下直後の起点確定待ちの数秒）だけは解除しない。
        // 起点がブレると飛距離がずれるため、安定化が終わるまで再アームして待つ。
        // 安定化後は計測中でも通常どおり解除してよい：画面が消えても進行中ラウンドは
        // 端末保存（lib/activeRound.ts）と「打つ前」地点（DM_INFLIGHT）から復元され、
        // 計測・スコアは失われない。
        if (shotStartGraceTimerRef.current !== null) {
          armTimer();
          return;
        }
        // 無操作タイムアウト → sentinel だけ release（requested は維持）。
        wakeSoftReleasedRef.current = true;
        void softReleaseWakeLock();
      }, WAKE_LOCK_IDLE_MS);
    };

    const onActivity = () => {
      // ソフト解除中だったときだけ取り直す。visibilitychange 側が画面再点灯時に
      // 既に取り直していれば tryAcquire の二重取得ガードで no-op になる。
      if (wakeSoftReleasedRef.current) {
        wakeSoftReleasedRef.current = false;
        void acquireWakeLock();
      }
      armTimer();
    };

    // 「打つ前」「止まった場所」「残り距離」「グリーン方向」等のボタン押下も
    // pointerdown として window に伝播するため、個別配線なしでここで拾える。
    const ACTIVITY_EVENTS = ["pointerdown", "touchstart", "scroll", "keydown"] as const;
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );
    armTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [roundEndConfirmed]);

  // 2秒待機タイマーと関連 ref をまとめて掃除するヘルパー。
  // handleCancelShot / selectHole / unmount / 15分タイムアウト等から呼ぶ。
  function clearShotStartGraceTimer() {
    if (shotStartGraceTimerRef.current) {
      clearTimeout(shotStartGraceTimerRef.current);
      shotStartGraceTimerRef.current = null;
    }
    latestShotPositionRef.current = null;
    startPositionRef.current = null;
    startReadyRef.current = false;
  }

  // 15分タイムアウトのトーストを3秒で自動消去。
  useEffect(() => {
    if (!shotTimeoutToast) return;
    const t = setTimeout(() => setShotTimeoutToast(null), 3000);
    return () => clearTimeout(t);
  }, [shotTimeoutToast]);

  // 暫定順位トーストを5秒で自動消去（文言が長めのため少し長く表示）。
  useEffect(() => {
    if (draconRankToasts.length === 0) return;
    const t = setTimeout(() => setDraconRankToasts([]), 5000);
    return () => clearTimeout(t);
  }, [draconRankToasts]);

  // ── Actions ─────────────────────────────────────────────────────────

  async function handleConfirmGreenCenter() {
    if (!currentHole || !golfCourseId || greenDialogStatus === "saving") return;
    // グリーンセンター登録（共有マスタ）はオフラインバッファ対象外。圏外では通信を
    // 投げず（getUser/upsert に到達させず）、登録不可を案内して終わる。
    if (isOffline()) {
      setGreenDialogError("オフラインのため登録できません。電波の良い場所でもう一度お試しください。");
      setGreenDialogStatus("error");
      return;
    }
    setGreenDialogStatus("saving");
    setGreenDialogError(null);
    try {
      // 仕様書 v1.3 章6: グリーンセンター登録は残り距離計算の基準点になるため
      // accuracy ≤ 5m を必須とする（10秒タイムアウト）。
      const fix = await awaitHighAccuracyFix();
      if (!fix) {
        setGreenDialogError("GPS精度が出ませんでした。場所を変えてもう一度お試しください。");
        setGreenDialogStatus("error");
        return;
      }
      const lat = fix.lat;
      const lng = fix.lng;
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("green_centers")
        .upsert(
          {
            course_id: golfCourseId,
            hole_number: currentHole.hole_number,
            green_type: greenType,
            latitude: lat,
            longitude: lng,
            registered_by: user?.id ?? null,
            registered_at: new Date().toISOString(),
          },
          { onConflict: "course_id,course_section,hole_number,green_type" },
        );
      if (error) throw error;
      setGreenCenters((prev) => ({
        ...prev,
        [currentHole.hole_number]: { lat, lng },
      }));
      setGreenToast({ holeNumber: currentHole.hole_number });
      setGreenDialogOpen(false);
      setGreenDialogStatus("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "位置情報を取得できませんでした";
      setGreenDialogError(msg);
      setGreenDialogStatus("error");
    }
  }

  // C8b: 「📍 残り距離を計測」ボタンの押下ハンドラ。
  // green_centers に登録済みなら、現在GPS（高精度 ≤5m fix）を取得して
  // Haversine 距離を yards/meters で返す。10秒以内に ≤5m が出なければ
  // null を返して再計測を促す（緑センター登録と同じ精度要件）。
  async function handleMeasureRemainingDistance() {
    if (!currentHole) return;
    const greenCenter = greenCenters[currentHole.hole_number];
    if (!greenCenter) {
      setRemainingDistanceError("このホールはグリーン未登録です");
      return;
    }
    setRemainingDistanceLoading(true);
    setRemainingDistanceError(null);
    try {
      const fix = await awaitHighAccuracyFix();
      if (!fix) {
        setRemainingDistanceError("GPS精度が出ませんでした。場所を変えてもう一度お試しください。");
        return;
      }
      const distM = calculateDistance(
        { latitude: fix.lat, longitude: fix.lng },
        { latitude: greenCenter.lat, longitude: greenCenter.lng },
      );
      setRemainingDistance({
        holeNumber: currentHole.hole_number,
        yards: metersToYards(distM),
        meters: Math.round(distM * 10) / 10,
      });
    } finally {
      setRemainingDistanceLoading(false);
    }
  }

  // C8b: 「🏌️ AIキャディに聞く」ボタンの押下ハンドラ。
  // ラウンド/ホール文脈を query param で AIキャディ画面に渡し、
  // 残り距離が計測済なら distance も自動連携する。未計測ならパラメータ省略
  // → AIキャディ側で手動入力 UI にフォールバック。
  function handleOpenAiCaddie() {
    if (!currentHole) return;
    const params = new URLSearchParams();
    params.set("round", roundId);
    params.set("hole", String(currentHole.hole_number));
    if (remainingDistance?.holeNumber === currentHole.hole_number) {
      params.set("distance", String(remainingDistance.yards));
    }
    router.push(`/ai-caddie?${params.toString()}`);
  }

  // Auto-dismiss the green-center success toast after 3 seconds.
  useEffect(() => {
    if (!greenToast) return;
    const t = setTimeout(() => setGreenToast(null), 3000);
    return () => clearTimeout(t);
  }, [greenToast]);

  function switchHoleMode() {
    const newMode = holeMode === "shot" ? "score" : "shot";
    setHoleMode(newMode);
    if (phase === "shooting" && newMode === "score") setPhase("score_entry");
    else if (phase === "score_entry" && newMode === "shot") setPhase("shooting");
  }

  // hole_number follows the start order: out(1→18) or in(10→18→1→9)
  function nextHoleNumber(currentHoleCount: number) {
    return ((startHole - 1 + currentHoleCount) % 18) + 1;
  }

  // オフラインで新ホールを開始する。既存ホール（同 hole_number）があれば
  // 新UUIDを振らず再利用（unique(round_id,hole_number) 違反回避）。無い時だけ
  // クライアントUUIDで採番してバッファに積み、readback と同形の最小オブジェクトを
  // 楽観追加する（created_at は holes 列に存在しないため積まない）。
  function startHoleOffline(holeNumber: number, par: number) {
    const existing = holes.find((h) => h.hole_number === holeNumber);
    if (!existing) {
      const holeId = crypto.randomUUID();
      void putHole({ id: holeId, round_id: roundId, hole_number: holeNumber, par });
      setHoles((prev) => [
        ...prev,
        { id: holeId, hole_number: holeNumber, par, score: null, putts: null, penalties: 0, shots: [] },
      ]);
    }
    setPhase(holeMode === "score" ? "score_entry" : "shooting");
  }

  async function handleStartHole(par: number) {
    setCreating(true);
    const holeNumber = nextHoleNumber(holes.length);
    // 先回り：圏外なら通信せず直接バッファ＋楽観追加。
    if (isOffline()) {
      startHoleOffline(holeNumber, par);
      setCreating(false);
      return;
    }
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("holes")
        .insert({ round_id: roundId, hole_number: holeNumber, par })
        .select("*, shots(*)")
        .single();
      if (!error && data) {
        setHoles((prev) => [...prev, data as Hole]);
        setPhase(holeMode === "score" ? "score_entry" : "shooting");
      } else if (isNetworkFailure(error)) {
        startHoleOffline(holeNumber, par);
      }
    } catch (e) {
      if (isNetworkFailure(e)) {
        startHoleOffline(holeNumber, par);
      } else {
        throw e;
      }
    } finally {
      setCreating(false);
    }
  }

  async function refreshCurrent() {
    if (!currentHole) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("holes").select("*, shots(*)").eq("id", currentHole.id).single();
    if (data) {
      setHoles((prev) => prev.map((h) => (h.id === (data as Hole).id ? (data as Hole) : h)));
    }
  }

  async function completeHole(putts: number) {
    if (!currentHole) return;
    const holeId = currentHole.id;
    const score = currentHole.shots.length + penalties + putts;
    const penaltiesNow = penalties;
    // (1) 楽観更新 + UI遷移を先に
    const updated = holes.map((h) => h.id === holeId ? { ...h, score, putts, penalties: penaltiesNow } : h);
    setHoles(updated);
    setPenalties(0);
    setPhase("par_select");
    // 先回り：圏外なら通信せず端末バッファへ（total_score は同期時に再計算）。
    if (isOffline()) {
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, score, putts, penalties: penaltiesNow });
      return;
    }
    const supabase = createClient();
    try {
      // (2) オンライン保存
      const { error } = await supabase.from("holes").update({ score, putts, penalties: penaltiesNow }).eq("id", holeId);
      if (error) throw error;
      // (3) 成功時のみ total_score を更新（best-effort）
      try {
        const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
        await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
      } catch (e) {
        console.error("[complete-hole] total_score update failed:", e);
      }
    } catch (e) {
      // (4) 圏外なら端末バッファへ（total_score は同期時に再計算）
      if (isNetworkFailure(e)) {
        void putScoreUpdate({ hole_id: holeId, round_id: roundId, score, putts, penalties: penaltiesNow });
      } else {
        console.error("[complete-hole] update failed:", e);
      }
    }
  }

  async function completeHoleByScore(totalScore: number, putts: number) {
    if (!currentHole) return;
    const holeId = currentHole.id;
    // (1) 楽観更新 + UI遷移を先に
    const updated = holes.map((h) => h.id === holeId ? { ...h, score: totalScore, putts, penalties: 0 } : h);
    setHoles(updated);
    setPhase("par_select");
    // 先回り：圏外なら通信せず端末バッファへ（total_score は同期時に再計算）。
    if (isOffline()) {
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, score: totalScore, putts, penalties: 0 });
      return;
    }
    const supabase = createClient();
    try {
      // (2) オンライン保存
      const { error } = await supabase.from("holes").update({ score: totalScore, putts, penalties: 0 }).eq("id", holeId);
      if (error) throw error;
      // (3) 成功時のみ total_score を更新（best-effort）
      try {
        const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
        await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
      } catch (e) {
        console.error("[complete-hole-by-score] total_score update failed:", e);
      }
    } catch (e) {
      // (4) 圏外なら端末バッファへ（total_score は同期時に再計算）
      if (isNetworkFailure(e)) {
        void putScoreUpdate({ hole_id: holeId, round_id: roundId, score: totalScore, putts, penalties: 0 });
      } else {
        console.error("[complete-hole-by-score] update failed:", e);
      }
    }
  }

  async function updateClub(shotId: string, club: Club) {
    // 先回り：圏外なら通信せず shot 部分更新をバッファへ。1W暫定順位（通信）も呼ばない。
    if (isOffline()) {
      void putShotUpdate({ id: shotId, club });
      setHoles((prev) => prev.map((h) => ({
        ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, club } : s),
      })));
      setEditing(null);
      return;
    }
    const supabase = createClient();
    await supabase.from("shots").update({ club }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, club } : s),
    })));
    setEditing(null);

    // 追加の副作用：1W タグ付け時だけ暫定順位を取得して小トースト表示。
    // 記録（上記 update）の後段で fire-and-forget。記録の成否・UIはブロックしない。
    if (club === "1w") {
      const holeNumber = holes.find((h) => h.shots.some((s) => s.id === shotId))?.hole_number;
      if (holeNumber != null) void notifyDraconRank(holeNumber);
    }
  }

  // ラウンド中フィードバック：1W記録直後に暫定順位 API を叩いて小トースト表示。
  // あらゆる例外・失敗（HTTPエラー / ok:false / items:[]）時は何も表示しない（流れを止めない）。
  async function notifyDraconRank(hole: number) {
    // 先回り：圏外なら API を叩かない（暫定順位トーストは出さない）。
    if (isOffline()) return;
    try {
      const res = await fetch(`/api/compe/in-round?round_id=${roundId}&hole=${hole}`);
      if (!res.ok) return;
      const body = await res.json().catch(() => null);
      if (!body || body.ok !== true || !Array.isArray(body.items) || body.items.length === 0) {
        return;
      }
      const messages = (body.items as {
        eventName: string; holeNumber: number; mode: "dracon" | "reverse";
        rank: number; total: number; gapYards: number;
      }[]).map((item) => {
        const base = `🏁 ${item.eventName} ${item.holeNumber}番：`;
        if (item.mode === "dracon") {
          return item.rank === 1
            ? `${base}暫定1位！（トップ）`
            : `${base}暫定${item.rank}位・トップまであと${item.gapYards}y`;
        }
        return item.rank === 1
          ? `${base}暫定1位！（最短）`
          : `${base}暫定${item.rank}位・最短まであと${item.gapYards}y`;
      });
      setDraconRankToasts(messages);
    } catch {
      // 無表示（記録を止めない）
    }
  }

  async function updateLie(shotId: string, lie: string) {
    // 先回り：圏外なら通信せず shot 部分更新をバッファへ。
    if (isOffline()) {
      void putShotUpdate({ id: shotId, lie_type: lie });
      setHoles((prev) => prev.map((h) => ({
        ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, lie_type: lie } : s),
      })));
      setEditing(null);
      return;
    }
    const supabase = createClient();
    await supabase.from("shots").update({ lie_type: lie }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, lie_type: lie } : s),
    })));
    setEditing(null);
  }

  async function updateBallShape(shotId: string, shape: string) {
    // 先回り：圏外なら通信せず shot 部分更新をバッファへ。
    if (isOffline()) {
      void putShotUpdate({ id: shotId, ball_shape: shape });
      setHoles((prev) => prev.map((h) => ({
        ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, ball_shape: shape } : s),
      })));
      setEditing(null);
      return;
    }
    const supabase = createClient();
    await supabase.from("shots").update({ ball_shape: shape }).eq("id", shotId);
    setHoles((prev) => prev.map((h) => ({
      ...h, shots: h.shots.map((s) => s.id === shotId ? { ...s, ball_shape: shape } : s),
    })));
    setEditing(null);
  }

  async function updateScore(holeId: string, newScore: number) {
    // (1) 楽観更新を先に
    const updated = holes.map((h) => h.id === holeId ? { ...h, score: newScore } : h);
    setHoles(updated);
    // 先回り：圏外なら通信せず端末バッファへ（total_score は同期時に再計算）。
    if (isOffline()) {
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, score: newScore });
      return;
    }
    const supabase = createClient();
    try {
      // (2) オンライン保存
      const { error } = await supabase.from("holes").update({ score: newScore }).eq("id", holeId);
      if (error) throw error;
      // (3) 成功時のみ total_score を更新（best-effort）
      try {
        const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
        await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
      } catch (e) {
        console.error("[update-score] total_score update failed:", e);
      }
    } catch (e) {
      // (4) 圏外なら端末バッファへ（total_score は同期時に再計算）
      if (isNetworkFailure(e)) {
        void putScoreUpdate({ hole_id: holeId, round_id: roundId, score: newScore });
      } else {
        console.error("[update-score] update failed:", e);
      }
    }
  }

  function handleHoleout() {
    setPhase("putt_select");

    // Record last shot's end position + distance in the background
    const lastShot = currentHole?.shots.at(-1);
    if (!lastShot?.start_lat || !lastShot?.start_lng) return;

    const shotId   = lastShot.id;
    const startLat = lastShot.start_lat;
    const startLng = lastShot.start_lng;

    void (async () => {
      const best = await getBestShotPosition();
      if (!best) return;
      const distM = calculateDistance(
        { latitude: startLat, longitude: startLng },
        { latitude: best.lat, longitude: best.lng },
      );
      const payload = {
        end_lat: best.lat,
        end_lng: best.lng,
        distance_meters: distM,
        distance_yards: metersToYards(distM),
      };
      // 先回り：圏外なら通信せず shot 部分更新をバッファへ（GPSは圏外でも動く）。
      if (isOffline()) {
        void putShotUpdate({ id: shotId, ...payload });
        return;
      }
      const supabase = createClient();
      await supabase.from("shots").update(payload).eq("id", shotId);
    })();
  }

  async function goBackToPrevHole() {
    const lastHole = holes.at(-1);
    if (!lastHole) return;
    const holeId = lastHole.id;
    setGoingBack(true);
    // (1) 楽観更新 + UI遷移を先に
    const updatedHoles = holes.map((h) =>
      h.id === holeId ? { ...h, score: null, putts: null } : h
    );
    setHoles(updatedHoles);
    setPenalties(lastHole.penalties ?? 0);
    setConfirmGoBack(false);
    setPhase(holeMode === "score" ? "score_entry" : "putt_select");
    // 先回り：圏外なら通信せず端末バッファへ（total_score は同期時に再計算）。
    if (isOffline()) {
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, score: null, putts: null });
      setGoingBack(false);
      return;
    }
    const supabase = createClient();
    try {
      // (2) オンライン保存
      const { error } = await supabase.from("holes").update({ score: null, putts: null }).eq("id", holeId);
      if (error) throw error;
      // (3) 成功時のみ total_score を更新（best-effort）
      try {
        const total = updatedHoles.reduce((s, h) => s + (h.score ?? 0), 0);
        await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
      } catch (e) {
        console.error("[go-back] total_score update failed:", e);
      }
    } catch (e) {
      // (4) 圏外なら端末バッファへ（total_score は同期時に再計算）
      if (isNetworkFailure(e)) {
        void putScoreUpdate({ hole_id: holeId, round_id: roundId, score: null, putts: null });
      } else {
        console.error("[go-back] update failed:", e);
      }
    } finally {
      // 圏外で await が失敗してもボタンが固まらないよう必ず解除。
      setGoingBack(false);
    }
  }

  function toggleEdit(id: string, type: "club" | "lie" | "shape") {
    setEditing((prev) =>
      prev?.id === id && prev.type === type ? null : { id, type }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────

  // ── Step 2-1 unified-UI handlers ───────────────────────────────────

  async function ensureHoleExists(n: number) {
    if (holes.some((h) => h.hole_number === n)) return;
    setCreating(true);
    const defaultPar = courseHoles?.find((c) => c.hole_number === n)?.par ?? 4;
    // 先回り：圏外なら通信せずクライアントUUIDで採番してバッファ＋楽観追加。
    // （この関数は currentHoleNumber 変更時に useEffect から自動発火するため、
    //  ガードが無いと機内モードでホール切替するたびに通信＝iOSダイアログを誘発する）
    if (isOffline()) {
      const holeId = crypto.randomUUID();
      void putHole({ id: holeId, round_id: roundId, hole_number: n, par: defaultPar });
      setHoles((prev) => [
        ...prev,
        { id: holeId, hole_number: n, par: defaultPar, score: null, putts: null, penalties: 0, shots: [] },
      ]);
      setCreating(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("holes")
      .insert({ round_id: roundId, hole_number: n, par: defaultPar })
      .select("*, shots(*)")
      .single();
    setCreating(false);
    if (!error && data) {
      setHoles((prev) => [...prev, data as Hole]);
    }
  }

  // Auto-create the hole row when the selected hole number changes
  useEffect(() => {
    void ensureHoleExists(currentHoleNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHoleNumber]);

  function selectHole(n: number) {
    // Drop uncommitted shot state + collapse the recording panel
    // ホール切替時に watch / 2秒待機タイマーが走っていれば停止（測定中の切替を許す）。
    clearShotStartGraceTimer();
    stopShotWatch();
    clearDmInflight();
    setDmStart(null);
    setDmEnd(null);
    setDmDistance(null);
    setShotNextAction("before");
    setShotMode("idle");
    setDmLoading("idle");
    setLastShot(null);
    // 残り距離はホール固有なので切替で破棄（新ホール用に再計測を促す）。
    setRemainingDistance(null);
    setRemainingDistanceError(null);
    setRemainingDistanceLoading(false);
    setCurrentHoleNumber(n);
  }

  function handleEnterRecordingMode() {
    setDmStart(null);
    setDmEnd(null);
    setDmDistance(null);
    setShotNextAction("before");
    setShotError(null);
    setShotMode("recording");
  }

  function handleCancelShot() {
    // ペア未完了でキャンセルされたケースに備え watch / 2秒待機タイマーを必ず停止。
    clearShotStartGraceTimer();
    stopShotWatch();
    clearDmInflight();
    setDmStart(null);
    setDmEnd(null);
    setDmDistance(null);
    setShotNextAction("before");
    setShotMode("idle");
    setDmLoading("idle");
  }

  // pair-scoped watchPosition を標準ハンドラで開く共通処理。
  // 新規計測（handleShotStart）・再読込からの復元（マウント時）・visibilitychange
  // からの再開で同一ロジックを使うために切り出した（挙動は従来の inline と同じ。
  // onTimeout に clearDmInflight を追加した点のみ新規＝計測破棄時の保存も消す）。
  // startShotWatch 内に再入ガードがあるため、既に watch が走っていれば張り直す。
  function beginShotWatch(): boolean {
    return startShotWatch({
      onUpdate: (p) => {
        latestShotPositionRef.current = p;
        if (!startReadyRef.current) {
          // 2秒待機中：内部で位置を受け取るだけで距離計算には使わない
          return;
        }
        const start = startPositionRef.current;
        if (!start) return;
        const distM = calculateDistance(
          { latitude: start.lat, longitude: start.lng },
          { latitude: p.lat, longitude: p.lng },
        );
        setDmDistance({
          yards: metersToYards(distM),
          meters: Math.round(distM * 10) / 10,
        });
      },
      onTimeout: () => {
        // 15分経過 → 押し忘れと判定して計測を破棄。
        // 15分カウントは「打つ前」押下時刻が起点（2秒待機含む）。
        clearShotStartGraceTimer();
        clearDmInflight();
        setDmStart(null);
        setDmEnd(null);
        setDmDistance(null);
        setShotNextAction("before");
        setShotMode("idle");
        setDmLoading("idle");
        setShotTimeoutToast("15分経過したので計測をリセットしました");
      },
    });
  }

  async function handleShotStart() {
    // 「打つ前」押下後2秒間はGPS精度安定化のために startPosition を確定させない
    // GPS精度±14mの状態で startPosition を記録すると、その後の位置取得との
    // 直線距離計算で 8〜14m の誤差が初期値として出てしまうため
    // 2秒待機して GPS が安定した位置を起点とすることで、正確な飛距離を測定する
    clearShotStartGraceTimer();
    clearDmInflight();
    setDmLoading("start");
    setDmStart(null);
    setDmEnd(null);
    setDmDistance({ yards: 0, meters: 0 });
    setShotNextAction("after");

    // pair-scoped watchPosition を即時起動。OS から fresh fix が届くたびに
    // latestShotPositionRef を更新し、startReadyRef が立っていれば
    // start からの直線距離を再計算して表示を更新する。
    const watchStarted = beginShotWatch();

    if (!watchStarted) {
      // watch 起動失敗（geolocation 利用不可など）→ 計測中断
      setDmDistance(null);
      setShotNextAction("before");
      setShotMode("idle");
      setDmLoading("idle");
      setShotTimeoutToast("GPSの取得に失敗しました");
      return;
    }

    // 2秒後に最新の watch 位置を startPosition として確定して計測開始
    shotStartGraceTimerRef.current = setTimeout(() => {
      shotStartGraceTimerRef.current = null;
      const latest = latestShotPositionRef.current;
      if (!latest) {
        // 2秒以内に1度も watch 更新が来なかった → GPS失敗扱い
        stopShotWatch();
        setDmDistance(null);
        setShotNextAction("before");
        setShotMode("idle");
        setDmLoading("idle");
        setShotTimeoutToast("GPSの取得に失敗しました");
        return;
      }
      const start = { lat: latest.lat, lng: latest.lng };
      startPositionRef.current = start;
      startReadyRef.current = true;
      setDmStart(start);
      setDmLoading("idle");
      // A: 始点確定 → 端末に保存。ポケットで画面が消える→ページ破棄→再読込で
      // 揮発する始点を、復帰時にこのキーから復元して計測を再開する。
      if (currentHole) {
        saveDmInflight({
          roundId,
          holeId: currentHole.id,
          holeNumber: currentHole.hole_number,
          start,
          startedAt: Date.now(),
          shotMode: "recording",
        });
      }
    }, 2000);
  }

  async function handleShotEnd() {
    // 2秒待機中に呼ばれたケース（UI上はボタン無効化されているが念のため）：
    // startPosition 未確定なのでペアは無効として扱う。
    if (shotStartGraceTimerRef.current !== null) {
      clearShotStartGraceTimer();
      stopShotWatch();
      setDmStart(null);
      setDmEnd(null);
      setDmDistance(null);
      setShotNextAction("before");
      setShotMode("idle");
      setDmLoading("idle");
      setShotTimeoutToast("計測時間が短すぎます。もう一度「打つ前」を押してください");
      return;
    }
    if (!dmStart) return;
    setDmLoading("end");
    try {
      // ライブ計測終了 → watch を停止して電池を節約。
      stopShotWatch();
      // 仕様書 v1.3 章6: 飛距離測定の終点は accuracy ≤ 5m を確定条件にする。
      // 10秒待っても達しなければショットペアを破棄して再計測を促す。
      const fix = await awaitHighAccuracyFix();
      if (!fix) {
        // ペア破棄 → 保存済み始点も消す（復帰で陳腐な計測を復元しないため）。
        clearDmInflight();
        setDmStart(null);
        setDmEnd(null);
        setDmDistance(null);
        setShotNextAction("before");
        setShotMode("idle");
        setShotTimeoutToast("GPS精度が出ませんでした。数歩動いてからもう一度『打つ前』を押してください");
        return;
      }
      setDmEnd({ lat: fix.lat, lng: fix.lng });
      const distM = calculateDistance(
        { latitude: dmStart.lat, longitude: dmStart.lng },
        { latitude: fix.lat, longitude: fix.lng },
      );
      setDmDistance({ yards: metersToYards(distM), meters: Math.round(distM * 10) / 10 });
      // After end is captured, "before" is what comes next (for the *next* shot)
      // — but only after the user confirms the current measurement. Until then,
      // we don't gate so the confirm button is the obvious next action.
    } finally {
      setDmLoading("idle");
    }
  }

  async function handleConfirmShot() {
    if (!currentHole || !dmStart || !dmEnd || !dmDistance || confirmingShot) return;
    const snapshot: LastShotMemo = {
      holeNumber: currentHole.hole_number,
      shotNumber: currentHole.shots.length + 1,
      distanceYards: dmDistance.yards,
      distanceMeters: dmDistance.meters,
    };

    // Eagerly show the feedback panel; idle reset is guaranteed by the finally below.
    setConfirmingShot(true);
    setLastShot(snapshot);
    setShotError(null);

    let insertOk = false;
    let insertErrMsg: string | null = null;
    try {
      // 先回り：圏外なら通信せず、パネルを2秒だけ表示してから finally のオフライン
      // 分岐（端末バッファ退避）へ流す。insertErrMsg を圏外印にすると
      // isNetworkFailure(insertErrMsg) が true になり既存のバッファ処理を再利用できる。
      if (isOffline()) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        insertErrMsg = "offline";
      } else {
        const supabase = createClient();
        // Run INSERT and the 2-second display timer in parallel so the panel is
        // always visible for ≥2s — even if INSERT is faster or fails immediately.
        const [insertResult] = await Promise.all([
          supabase.from("shots").insert({
            hole_id: currentHole.id,
            round_id: roundId,
            shot_number: snapshot.shotNumber,
            start_lat: dmStart.lat,
            start_lng: dmStart.lng,
            end_lat: dmEnd.lat,
            end_lng: dmEnd.lng,
            distance_meters: dmDistance.meters,
            distance_yards: dmDistance.yards,
            club_input_at: inputMode === "realtime" ? "当日" : "事後",
          }),
          new Promise<void>((r) => setTimeout(r, 2000)),
        ]);
        if (insertResult.error) {
          console.error("[confirm-shot] insert error:", insertResult.error.message);
          insertErrMsg = insertResult.error.message;
        } else {
          insertOk = true;
        }
      }
    } catch (e) {
      console.error("[confirm-shot] unexpected error:", e);
      insertErrMsg = e instanceof Error ? e.message : String(e);
    } finally {
      // Refresh in the background only when the INSERT succeeded.
      if (insertOk) {
        void refreshCurrent();
      } else if (isNetworkFailure(insertErrMsg) && currentHole && dmStart && dmEnd && dmDistance) {
        // 圏外：端末バッファに積み、楽観的にローカル state を更新する。READ
        // （refreshCurrent）はスキップ。電波が戻ると OfflineSync が自動同期する。
        const shotId = crypto.randomUUID();
        const holeId = currentHole.id;
        const shotNumber = snapshot.shotNumber;
        const start = dmStart;
        const end = dmEnd;
        const dist = dmDistance;
        void putShot({
          id: shotId,
          hole_id: holeId,
          round_id: roundId,
          shot_number: shotNumber,
          start_lat: start.lat,
          start_lng: start.lng,
          end_lat: end.lat,
          end_lng: end.lng,
          distance_meters: dist.meters,
          distance_yards: dist.yards,
          club_input_at: inputMode === "realtime" ? "当日" : "事後",
          created_at: new Date().toISOString(),
        });
        setHoles((prev) =>
          prev.map((h) =>
            h.id === holeId
              ? {
                  ...h,
                  shots: [
                    ...h.shots,
                    {
                      id: shotId,
                      shot_number: shotNumber,
                      club: null,
                      distance_yards: dist.yards,
                      lie_type: null,
                      ball_shape: null,
                      ball_direction: null,
                      start_lat: start.lat,
                      start_lng: start.lng,
                    },
                  ],
                }
              : h,
          ),
        );
        // setLastShot(snapshot) は維持（「直前のショット」を正しく表示）。
        setShotTimeoutToast("オフライン保存しました（電波が戻ると自動で同期）");
      } else {
        // Don't surface a phantom "直前のショット" if the write failed.
        setLastShot(null);
        setShotError(insertErrMsg ?? "保存に失敗しました");
      }
      // ALWAYS unwind to idle so the user is never stuck on the panel.
      // 念のため watch / 2秒待機 ref を再度クリア（handleShotEnd で既に止めているはず）。
      // 計測完了（成功・失敗いずれも）→ 保存済み始点を消す。
      clearShotStartGraceTimer();
      stopShotWatch();
      clearDmInflight();
      setDmStart(null);
      setDmEnd(null);
      setDmDistance(null);
      setShotNextAction("before");
      setConfirmingShot(false);
      setShotMode("idle");
    }
  }

  async function updateHolePar(par: number) {
    if (!currentHole) return;
    const holeId = currentHole.id;
    // 先回り：圏外なら通信せず端末バッファへ（par も holes 行の更新なので score 更新と同経路）。
    if (isOffline()) {
      setHoles((prev) => prev.map((h) => (h.id === holeId ? { ...h, par } : h)));
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, par });
      return;
    }
    const supabase = createClient();
    await supabase.from("holes").update({ par }).eq("id", holeId);
    setHoles((prev) => prev.map((h) => (h.id === holeId ? { ...h, par } : h)));
  }

  async function updateHoleScoreUnified(score: number | null) {
    if (!currentHole) return;
    const holeId = currentHole.id;
    // (1) 楽観更新を先に
    const updated = holes.map((h) => (h.id === holeId ? { ...h, score } : h));
    setHoles(updated);
    // 先回り：圏外なら通信せず端末バッファへ（total_score は同期時に再計算）。
    if (isOffline()) {
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, score });
      return;
    }
    const supabase = createClient();
    try {
      // (2) オンライン保存
      const { error } = await supabase.from("holes").update({ score }).eq("id", holeId);
      if (error) throw error;
      // (3) 成功時のみ total_score を更新（best-effort）
      try {
        const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
        await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
      } catch (e) {
        console.error("[update-hole-score] total_score update failed:", e);
      }
    } catch (e) {
      // (4) 圏外なら端末バッファへ（total_score は同期時に再計算）
      if (isNetworkFailure(e)) {
        void putScoreUpdate({ hole_id: holeId, round_id: roundId, score });
      } else {
        console.error("[update-hole-score] update failed:", e);
      }
    }
  }

  async function updateHolePutts(putts: number | null) {
    if (!currentHole) return;
    const holeId = currentHole.id;
    // (1) 楽観更新を先に
    setHoles((prev) => prev.map((h) => (h.id === holeId ? { ...h, putts } : h)));
    // 先回り：圏外なら通信せず端末バッファへ。
    if (isOffline()) {
      void putScoreUpdate({ hole_id: holeId, round_id: roundId, putts });
      return;
    }
    const supabase = createClient();
    try {
      // (2) オンライン保存（元々 rounds.total_score は更新しない）
      const { error } = await supabase.from("holes").update({ putts }).eq("id", holeId);
      if (error) throw error;
    } catch (e) {
      // (4) 圏外なら端末バッファへ
      if (isNetworkFailure(e)) {
        void putScoreUpdate({ hole_id: holeId, round_id: roundId, putts });
      } else {
        console.error("[update-hole-putts] update failed:", e);
      }
    }
  }

  async function handleRoundEndConfirm() {
    setConfirmLoading(true);
    // Handicap differential only meaningful for full 18H rounds.
    let diff: number | null = null;
    if (
      completedHoles.length === 18 &&
      courseRating != null && slopeRating != null && slopeRating !== 0
    ) {
      diff = Math.round(((totalScore - courseRating) * 113 / slopeRating) * 10) / 10;
    }
    // 先回り：圏外なら通信せず端末バッファへ（handicap_differential を同期時に rounds へ）。
    if (isOffline()) {
      void putRoundUpdate({ round_id: roundId, handicap_differential: diff });
    } else {
      const supabase = createClient();
      await supabase.from("rounds").update({ handicap_differential: diff }).eq("id", roundId);
    }

    stopGpsTracking();
    void releaseWakeLock();
    // ラウンドを正常に終了／保存できた → 端末スナップショットを破棄（C）。
    // 以後ホームを開いても自動復帰しない。
    clearActiveRound();

    setHandicapDiff(diff);
    setConfirmLoading(false);
    setRoundEndConfirmed(true);
    if (!isRoundDone) setEndedEarly(true);
    if (betaMode) {
      setShowBetaModal(true);
    } else if (paymentStatus === "pending") {
      setShowPaymentModal(true);
    }
  }

  async function handlePayNow() {
    if (payProcessingRef.current) return;
    payProcessingRef.current = true;
    setPayLoading(true);
    setPayError("");
    try {
      const res = await fetch("/api/stripe/checkout-once", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ golf_course: golfCourseName, payment_token: paymentTokenRef.current }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error ?? "no url");
      }
    } catch {
      setPayError("決済の開始に失敗しました。もう一度お試しください。");
      setPayLoading(false);
    } finally {
      payProcessingRef.current = false;
    }
  }

  // 過去ラウンド閲覧時のスコア修正（pastView && mode==="score" のみ有効）
  async function handleUpdateHole(holeId: string, update: Partial<Hole>) {
    const supabase = createClient();
    await supabase.from("holes").update(update).eq("id", holeId);
    const updated = holes.map((h) => (h.id === holeId ? { ...h, ...update } : h));
    setHoles(updated);
    if ("score" in update) {
      const total = updated.reduce((s, h) => s + (h.score ?? 0), 0);
      await supabase.from("rounds").update({ total_score: total }).eq("id", roundId);
    }
  }

  if ((isRoundDone || endedEarly) && !roundEndConfirmed) {
    return <RoundEndScreen onConfirm={handleRoundEndConfirm} confirming={confirmLoading} />;
  }
  if (isRoundDone || endedEarly) {
    return (
      <>
        <RoundComplete
          holes={holes}
          totalScore={totalScore}
          totalPar={totalPar}
          mode={mode}
          handicapDiff={handicapDiff}
          paymentPending={!betaMode && paymentStatus === "pending"}
          onPayNow={() => setShowPaymentModal(true)}
          pastView={pastView}
          onUpdateHole={handleUpdateHole}
          avgDriverYards={avgDriverYards}
          maxDriverYards={maxDriverYards}
        />
        {!betaMode && showPaymentModal && (
          <PaymentRequiredModal
            onPay={handlePayNow}
            onClose={() => setShowPaymentModal(false)}
            loading={payLoading}
            error={payError}
          />
        )}
        {betaMode && showBetaModal && (
          <BetaCompleteModal onClose={() => setShowBetaModal(false)} />
        )}
      </>
    );
  }

  const totalDiff = totalScore - totalPar;

  return (
    // 最下部（残り距離カード等）が固定ナビバー＋iOSセーフエリアに被って見切れない
    // よう、下余白をナビ高さ(8rem)＋env(safe-area-inset-bottom)分まで確保する。
    // calc() は +/- の前後に空白必須。Tailwind arbitrary value では _ が空白へ変換される
    // （空白無し "...)+8rem" は無効CSSとして宣言ごと破棄され、padding が効かない）。
    <div className="space-y-2 pb-[calc(env(safe-area-inset-bottom)_+_8rem)]">
      {/* Header — live running score · GPS strength.
          コース名は上位ページ (round/[id]/page.tsx) のヘッダーで表示済みのため
          ここでは重複表示しない（縦スペース節約 / 認知負荷低減）。
          ライブ途中経過スコアと GPS ステータスは残す。 */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          {completedHoles.length > 0 && (
            <p className="text-lg font-normal text-green-500 tabular-nums">
              {completedHoles.length}H {totalScore}
              {totalDiff !== 0 && (
                <span className="ml-0.5">({totalDiff > 0 ? "+" : ""}{totalDiff})</span>
              )}
            </p>
          )}
        </div>
        <GpsIndicator />
      </div>

      {/* 4-row score table: H / P / 打 / パ + end-round at far right */}
      <ScoreTable
        holes={holes}
        startHole={startHole}
        courseHoles={courseHoles}
        currentHoleNumber={currentHoleNumber}
        onSelectHole={selectHole}
        onEndRound={() => setConfirmEarlyEnd(true)}
      />

      {/* Compact score entry: パー / 打数 / パット
          目線の流れ（見る→入力する→状況確認→打つ準備）に合わせ、
          スコア表の直下に配置（コンパス・飛距離測定より上）。 */}
      <CompactScoreEntry
        par={currentHole?.par ?? null}
        score={currentHole?.score ?? null}
        putts={currentHole?.putts ?? null}
        onParChange={updateHolePar}
        onScoreChange={updateHoleScoreUnified}
        onPuttsChange={updateHolePutts}
      />

      {/* Compact wind compass — half-height. Always rendered so the green-direction
          control is reachable even when wind data is unavailable.
          「次のホール →」は上段右（残り距離の真上）に配置。次ホール移動は表タップと
          同じ selectHole を流用、最終ホールでは非活性。 */}
      <CompactCompass
        windDirection={windDirection ?? null}
        windSpeed={windSpeed ?? null}
        visible={windVisible}
        onToggle={() => setWindVisible((v) => !v)}
        onNextHole={() => { if (nextHoleNum != null) selectHole(nextHoleNum); }}
        nextHoleDisabled={nextHoleNum == null}
        greenDirection={greenDirections[currentHoleNumber] ?? null}
        onSetGreenDirection={(deg) =>
          setGreenDirections((prev) => ({ ...prev, [currentHoleNumber]: deg }))
        }
        greenCenter={greenCenters[currentHoleNumber] ?? null}
      />


      {/* Shot recording — toggleable. Idle: single ⛳ entry button.
          Recording: 打つ前 → 止まった場所 → confirm/cancel flow. */}
      {shotMode === "idle" ? (
        <IdleShotSection
          disabled={!currentHole || creating}
          onStart={handleEnterRecordingMode}
          lastShot={lastShot}
          error={shotError}
        />
      ) : (
        <ActiveShotPanel
          hasCurrentHole={!!currentHole}
          creating={creating}
          dmStart={dmStart}
          dmEnd={dmEnd}
          dmDistance={dmDistance}
          dmLoading={dmLoading}
          shotCount={currentHole?.shots.length ?? 0}
          confirming={confirmingShot}
          lastShot={lastShot}
          onShotStart={handleShotStart}
          onShotEnd={handleShotEnd}
          onConfirmShot={handleConfirmShot}
          onCancel={handleCancelShot}
        />
      )}

      {/* C8b: 残り距離カード（グリーンセンター登録済みホールで表示） */}
      {currentHole && (
        <RemainingDistanceCard
          holeNumber={currentHole.hole_number}
          greenCenter={greenCenters[currentHole.hole_number] ?? null}
          remaining={remainingDistance}
          loading={remainingDistanceLoading}
          error={remainingDistanceError}
          onMeasure={handleMeasureRemainingDistance}
          onOpenAiCaddie={handleOpenAiCaddie}
        />
      )}

      {/* グリーンセンター登録ボタンは管理者機能のため一般ユーザーには非表示。
          GreenCenterDialog / handleConfirmGreenCenter / green-dialog state は
          休眠状態で残置（到達不能だが将来の管理者UI再導入用に温存）。 */}

      {/* Modals */}
      {confirmEarlyEnd && (
        <FinalConfirmModal
          holes={holes}
          startHole={startHole}
          courseHoles={courseHoles}
          onConfirm={() => {
            setConfirmEarlyEnd(false);
            setEndedEarly(true);
          }}
          onCancel={() => setConfirmEarlyEnd(false)}
        />
      )}

      {greenDialogOpen && currentHole && (
        <GreenCenterDialog
          holeNumber={currentHole.hole_number}
          status={greenDialogStatus}
          errorMessage={greenDialogError}
          onConfirm={handleConfirmGreenCenter}
          onCancel={() => {
            if (greenDialogStatus === "saving") return;
            setGreenDialogOpen(false);
            setGreenDialogStatus("idle");
            setGreenDialogError(null);
          }}
        />
      )}

      {greenToast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl
                     bg-emerald-600 text-white text-lg font-semibold shadow-lg"
        >
          ✅ ホール{greenToast.holeNumber}のグリーンセンターを登録しました
        </div>
      )}

      {shotTimeoutToast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl
                     bg-amber-600 text-white text-lg font-semibold shadow-lg"
        >
          ⏱ {shotTimeoutToast}
        </div>
      )}

      {draconRankToasts.length > 0 && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl
                     bg-green-700 text-white text-sm font-semibold shadow-lg space-y-1 max-w-[90vw] text-center"
        >
          {draconRankToasts.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>
      )}

    </div>
  );
}

// ── RemainingDistanceCard（C8b Min版・①+②統合） ────────────────────────
//
// グリーンまでの残り距離表示＋AIキャディ遷移を1カードに統合。
// - 未登録ホール: 「グリーン未登録」グレー＋小さく「🏌️ AIキャディに聞く（手動入力）」
// - 登録済み + 未計測: 緑枠＋2カラムボタン（残り距離を計測 / AIキャディに聞く）
// - 計測済み: yards 大文字＋2カラムボタン（再計測 / AIキャディに聞く）
// 残り距離計測は手動オンデマンド (awaitHighAccuracyFix 1回呼出・電池影響ゼロ)。
// AIキャディ遷移は計測済なら distance を URL に乗せて自動連携。

function RemainingDistanceCard({
  holeNumber,
  greenCenter,
  remaining,
  loading,
  error,
  onMeasure,
  onOpenAiCaddie,
}: {
  holeNumber: number;
  greenCenter: { lat: number; lng: number } | null;
  remaining: { holeNumber: number; yards: number; meters: number } | null;
  loading: boolean;
  error: string | null;
  onMeasure: () => void;
  onOpenAiCaddie: () => void;
}) {
  if (!greenCenter) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
        <p className="text-sm text-gray-500 text-center">
          📍 このホールはグリーン未登録のため残り距離は計測できません
        </p>
        <button
          onClick={onOpenAiCaddie}
          className="w-full py-2 rounded-lg text-sm font-semibold
                     bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white
                     transition-colors active:scale-95"
        >
          🏌️ AIキャディに聞く（距離は手動入力）
        </button>
      </div>
    );
  }
  const isFresh = remaining?.holeNumber === holeNumber;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
      {isFresh && remaining && (
        <div className="text-center">
          <p className="text-xs text-emerald-600 font-medium">グリーンまで</p>
          <p className="text-5xl font-bold text-emerald-700 tabular-nums leading-tight">
            {remaining.yards}
            <span className="text-2xl ml-0.5">y</span>
          </p>
          <p className="text-xs text-emerald-500">({remaining.meters}m)</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onMeasure}
          disabled={loading}
          className="py-3 rounded-lg text-sm font-semibold
                     bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white
                     disabled:opacity-60 disabled:cursor-not-allowed
                     active:scale-95 transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span>測位中…</span>
            </span>
          ) : isFresh ? "📍 再計測" : "📍 残り距離を計測"}
        </button>
        <button
          onClick={onOpenAiCaddie}
          className="py-3 rounded-lg text-sm font-semibold
                     bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white
                     transition-colors active:scale-95"
        >
          🏌️ AIキャディに聞く
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 text-center">
          {error}
        </p>
      )}
    </div>
  );
}

// ── GreenCenterDialog ──────────────────────────────────────────────────

function GreenCenterDialog({
  holeNumber, status, errorMessage, onConfirm, onCancel,
}: {
  holeNumber: number;
  status: "idle" | "saving" | "error";
  errorMessage: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 space-y-3">
        <h3 className="text-xl font-bold text-emerald-800 text-center">
          📍 ホール{holeNumber} グリーンセンター登録
        </h3>
        <p className="text-lg text-gray-700 leading-relaxed text-center">
          グリーンの中央に立って<br />「登録」を押してください
        </p>
        <p className="text-base text-gray-500 leading-relaxed text-center">
          ※カップの位置ではなく、グリーンの中心点を狙ってください
        </p>
        {status === "error" && errorMessage && (
          <p className="text-base text-red-600 bg-red-50 border border-red-100 rounded-lg p-2 text-center">
            {errorMessage}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={status === "saving"}
            className="flex-1 py-2.5 rounded-xl text-lg font-semibold
                       bg-gray-100 hover:bg-gray-200 text-gray-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       active:scale-95 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={status === "saving"}
            className="flex-1 py-2.5 rounded-xl text-lg font-semibold
                       bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white
                       disabled:opacity-60 disabled:cursor-not-allowed shadow-sm
                       active:scale-95 transition-colors"
          >
            {status === "saving" ? "📡 取得中…" : "登録"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── HoleTabs ────────────────────────────────────────────────────────

function HoleTabs({
  holes, startHole, activeHoleNumber, onTabClick, onEndRound,
}: {
  holes: Hole[];
  startHole: number;
  activeHoleNumber: number | null;
  onTabClick: (holeNumber: number) => void;
  onEndRound: () => void;
}) {
  const playOrder = Array.from({ length: 18 }, (_, i) => ((startHole - 1 + i) % 18) + 1);
  const holeMap = Object.fromEntries(holes.map((h) => [h.hole_number, h]));
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Keep active tab in view
  useEffect(() => {
    const num = activeHoleNumber ?? holes.at(-1)?.hole_number;
    if (num) tabRefs.current[num]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeHoleNumber, holes.length]);

  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white border-b border-green-100">
      <div className="overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {playOrder.map((num) => {
            const hole = holeMap[num] as Hole | undefined;
            const isCompleted = hole?.score !== null && hole?.score !== undefined;
            const isActive = hole && hole.score === null;
            const isFuture = !hole;

            let containerCls = "";
            let numCls = "";
            let scoreTxt: string | null = null;

            if (isCompleted) {
              const d = hole.score! - hole.par;
              if (d <= -2) { containerCls = "bg-yellow-100 border-yellow-300"; numCls = "text-yellow-700"; }
              else if (d === -1) { containerCls = "bg-red-100 border-red-300"; numCls = "text-red-600"; }
              else if (d === 0)  { containerCls = "bg-green-100 border-green-300"; numCls = "text-green-700"; }
              else if (d === 1)  { containerCls = "bg-blue-100 border-blue-300"; numCls = "text-blue-600"; }
              else if (d === 2)  { containerCls = "bg-purple-100 border-purple-300"; numCls = "text-purple-600"; }
              else               { containerCls = "bg-gray-100 border-gray-300"; numCls = "text-gray-600"; }
              scoreTxt = String(hole.score);
            } else if (isActive) {
              containerCls = "bg-green-600 border-green-600 ring-2 ring-green-400 ring-offset-1";
              numCls = "text-white";
            } else {
              containerCls = "bg-gray-50 border-gray-200";
              numCls = "text-gray-300";
            }

            return (
              <button
                key={num}
                ref={(el) => { tabRefs.current[num] = el; }}
                disabled={isFuture}
                onClick={() => onTabClick(num)}
                className={`flex flex-col items-center rounded-xl border px-2.5 py-2 min-w-[3.5rem]
                            transition-colors active:scale-95 ${containerCls}
                            ${isFuture ? "cursor-default" : ""}`}
              >
                <span className={`text-base font-bold leading-tight ${numCls}`}>{num}H</span>
                {scoreTxt && (
                  <span className={`text-sm font-bold leading-none ${numCls}`}>{scoreTxt}</span>
                )}
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white mt-1 animate-pulse" />
                )}
              </button>
            );
          })}
          {/* End-round button immediately after 18H to make termination discoverable */}
          <button
            onClick={onEndRound}
            aria-label="ラウンドを終了する"
            className="flex flex-col items-center justify-center rounded-xl border-2 px-2.5 py-2 min-w-[3.5rem]
                       bg-red-600 hover:bg-red-700 active:bg-red-800 border-red-700 text-white
                       font-bold transition-colors active:scale-95 shadow-md"
          >
            <span className="text-lg leading-tight">🏁</span>
            <span className="text-[11px] leading-tight">終了</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function AutoParCard({
  holeNumber, par, onCreate, creating,
}: {
  holeNumber: number;
  par: number;
  onCreate: (par: number) => void;
  creating: boolean;
}) {
  return (
    <div className="card text-center space-y-4">
      <p className="text-sm font-medium text-green-500">ホール {holeNumber}</p>
      <p className="text-7xl font-bold text-green-700">Par {par}</p>
      <button
        onClick={() => onCreate(par)}
        disabled={creating}
        className="w-full py-5 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white font-bold text-xl transition-colors disabled:opacity-50"
      >
        {creating ? "開始中..." : "スタート"}
      </button>
    </div>
  );
}

function ParSelector({
  holeNumber, onCreate, creating,
}: {
  holeNumber: number;
  onCreate: (par: number) => void;
  creating: boolean;
}) {
  return (
    <div className="card">
      <p className="text-lg font-bold text-green-700 mb-3 text-center">
        ホール {holeNumber} — パーを選択
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[3, 4, 5].map((p) => (
          <button key={p} onClick={() => onCreate(p)} disabled={creating}
            className="py-8 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       text-white font-bold text-5xl transition-colors disabled:opacity-50">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveHoleCard({
  hole, roundId, penalties, onAddPenalty, onRemovePenalty,
  onShotRecorded, onHoleout,
  editing, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallShape, inputMode,
}: {
  hole: Hole;
  roundId: string;
  penalties: number;
  onAddPenalty: () => void;
  onRemovePenalty: () => void;
  onShotRecorded: () => void;
  onHoleout: () => void;
  editing: { id: string; type: "club" | "lie" | "shape" } | null;
  onToggleEdit: (id: string, type: "club" | "lie" | "shape") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: string) => void;
  onUpdateBallShape: (id: string, shape: string) => void;
  inputMode: "post_round" | "realtime";
}) {
  const lastShot = hole.shots.at(-1);
  const prevShot =
    lastShot?.start_lat != null && lastShot?.start_lng != null
      ? { id: lastShot.id, start_lat: lastShot.start_lat, start_lng: lastShot.start_lng }
      : null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-green-600 rounded-full flex items-center justify-center
                          text-white font-bold text-base">
            {hole.hole_number}
          </div>
          <div>
            <p className="font-bold text-green-900 text-lg">ホール {hole.hole_number}</p>
            <p className="text-sm text-green-500">
              パー{hole.par} · {hole.shots.length}打記録済
              {penalties > 0 && <span className="text-red-500"> +{penalties}罰</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button onClick={onHoleout}
            className="bg-green-600 hover:bg-green-700 text-white font-bold
                       px-5 py-3 rounded-xl text-base transition-colors flex flex-col items-center gap-0.5">
            <span>グリーンオン</span>
            <span className="text-xs font-normal opacity-80">グリーンで押してね</span>
          </button>
        </div>
      </div>

      {/* Shot list shown above the record button */}
      {hole.shots.length > 0 && (
        <ShotList
          shots={hole.shots}
          editing={editing}
          onToggleEdit={onToggleEdit}
          onUpdateClub={onUpdateClub}
          onUpdateLie={onUpdateLie}
          onUpdateBallShape={onUpdateBallShape}
          inputMode={inputMode}
        />
      )}

      <ShotRecorder
        holeId={hole.id}
        roundId={roundId}
        shotNumber={hole.shots.length + 1}
        prevShot={prevShot}
        onShotRecorded={onShotRecorded}
        inputMode={inputMode}
      />

      {penalties > 0 ? (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-base font-semibold text-red-700">ペナルティ</span>
          <div className="flex items-center gap-3">
            <button
              onClick={onRemovePenalty}
              className="w-10 h-10 rounded-lg bg-white border border-red-200 text-red-600
                         font-bold text-xl transition-colors active:scale-95 hover:bg-red-50"
            >
              −
            </button>
            <span className="text-2xl font-bold text-red-700 tabular-nums w-8 text-center">
              {penalties}
            </span>
            <button
              onClick={onAddPenalty}
              className="w-10 h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white
                         font-bold text-xl transition-colors active:scale-95"
            >
              ＋
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onAddPenalty}
          className="w-full py-3 rounded-xl border border-dashed border-red-200 text-red-400
                     text-base font-medium hover:bg-red-50 transition-colors active:scale-95"
        >
          ＋ ペナルティ追加（OB・前進4打など）
        </button>
      )}
    </div>
  );
}

function PuttSelector({
  shotCount, penalties, par, isLastHole, onSelect,
}: {
  shotCount: number;
  penalties: number;
  par: number;
  isLastHole: boolean;
  onSelect: (putts: number) => void;
}) {
  const [selectedPutts, setSelectedPutts] = useState<number | null>(null);

  const total       = selectedPutts != null ? shotCount + penalties + selectedPutts : null;
  const diff        = total != null ? total - par : null;
  const resultLabel = diff != null
    ? diff <= -2 ? "イーグル" : diff === -1 ? "バーディ" :
      diff === 0 ? "パー"     : diff === 1  ? "ボギー"   :
      diff === 2 ? "ダブル"   : `+${diff}`
    : null;

  return (
    <div className="card space-y-4">
      <div className="text-center">
        <p className="text-xl font-bold text-green-800">パット数は？</p>
        <p className="text-base text-green-500">
          ショット {shotCount}打
          {penalties > 0 && <span className="text-red-500"> +{penalties}罰</span>}
          {" "}+ パット
        </p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((putts) => {
          const t = shotCount + penalties + putts;
          const d = t - par;
          const label =
            d <= -2 ? "イーグル" : d === -1 ? "バーディ" :
            d === 0 ? "パー"     : d === 1  ? "ボギー"   :
            d === 2 ? "ダブル"   : `+${d}`;
          const isSelected = selectedPutts === putts;
          const color = isSelected
            ? "border-green-700 bg-green-700 text-white scale-105"
            : d <= -1 ? "border-red-400 bg-red-50 text-red-700" :
              d === 0  ? "border-green-500 bg-green-50 text-green-700" :
              d === 1  ? "border-blue-400 bg-blue-50 text-blue-700" :
              "border-gray-300 bg-gray-50 text-gray-700";
          return (
            <button key={putts} onClick={() => setSelectedPutts(putts)}
              className={`flex flex-col items-center py-5 rounded-2xl border-2 font-bold
                          transition-all active:scale-95 ${color}`}>
              <span className="text-4xl">{putts}</span>
              <span className="text-sm mt-1 font-medium">{label}</span>
              <span className="text-sm font-bold">{t}打</span>
            </button>
          );
        })}
      </div>

      {selectedPutts != null && total != null && resultLabel != null && (
        <div className="space-y-3">
          <div className="text-center py-2 bg-green-50 rounded-xl">
            <p className="text-base text-green-600">
              {shotCount}打
              {penalties > 0 && <span className="text-red-500"> +{penalties}罰</span>}
              {" "}+ {selectedPutts}パット ={" "}
              <span className="font-bold">{total}打</span>
            </p>
            <p className="font-bold text-xl text-green-800">{resultLabel}</p>
          </div>
          <button
            onClick={() => onSelect(selectedPutts)}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       text-white font-bold text-xl transition-colors">
            {isLastHole ? "ラウンド終了" : "次のホールへ →"}
          </button>
        </div>
      )}
    </div>
  );
}

function CompletedHoleCard({
  hole, mode, expanded, editing, onToggle, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallShape, onUpdateScore,
}: {
  hole: Hole;
  mode: "shot" | "score";
  expanded: boolean;
  editing: { id: string; type: "club" | "lie" | "shape" } | null;
  onToggle: () => void;
  onToggleEdit: (id: string, type: "club" | "lie" | "shape") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: string) => void;
  onUpdateBallShape: (id: string, shape: string) => void;
  onUpdateScore: (holeId: string, newScore: number) => void;
}) {
  const [scoreEditing, setScoreEditing] = useState(false);
  const { text, cls } = scoreLabel(hole.score!, hole.par);

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <button onClick={onToggle} className="flex-1 flex items-center gap-2 min-w-0 text-left">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center
                          text-green-700 font-bold text-sm shrink-0">
            {hole.hole_number}
          </div>
          <span className="text-base text-green-600 font-medium truncate">
            {mode === "score" ? (
              <>Par{hole.par} · {hole.score}打 / {hole.putts}P</>
            ) : (
              <>
                Par{hole.par} · {hole.shots.length}打
                {(hole.penalties ?? 0) > 0 && <span className="text-red-500">+{hole.penalties}罰</span>}
                +{hole.putts}P
              </>
            )}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${cls}`}>{text}</span>
          <button
            onClick={() => setScoreEditing((v) => !v)}
            className={`p-2.5 rounded-lg text-xl leading-none transition-colors ${
              scoreEditing ? "text-green-700 bg-green-100" : "text-green-300 hover:text-green-500"
            }`}
            aria-label="スコア修正"
          >
            ✏
          </button>
          <button onClick={onToggle} className="text-green-300 text-base p-2.5">
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {/* Inline score editor */}
      {scoreEditing && (
        <ScoreEditor
          hole={hole}
          onSave={onUpdateScore}
          onClose={() => setScoreEditing(false)}
        />
      )}

      {/* Shot detail (expandable). Read-only after the hole is logged — keep
          showing values entered during the round (or post-round via stats). */}
      {expanded && hole.shots.length > 0 && (
        <div className="mt-3 pt-3 border-t border-green-50">
          <ShotList
            shots={hole.shots}
            editing={editing}
            onToggleEdit={onToggleEdit}
            onUpdateClub={onUpdateClub}
            onUpdateLie={onUpdateLie}
            onUpdateBallShape={onUpdateBallShape}
            inputMode="realtime"
          />
        </div>
      )}
    </div>
  );
}

// ── ScoreEditor ───────────────────────────────────────────────────────

function ScoreEditor({ hole, onSave, onClose }: {
  hole: Hole;
  onSave: (holeId: string, newScore: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(hole.score ?? 1);

  function clamp(n: number) { return Math.max(1, n); }

  return (
    <div className="flex items-center gap-2 py-3 mt-2 border-t border-green-50">
      <button
        onClick={() => setValue((v) => clamp(v - 1))}
        className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                   font-bold text-2xl transition-colors active:scale-95"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={1}
        onChange={(e) => {
          const n = parseInt(e.target.value);
          if (!isNaN(n)) setValue(clamp(n));
        }}
        className="w-16 text-center text-2xl font-bold text-green-800
                   border-b-2 border-green-400 bg-transparent outline-none"
      />
      <button
        onClick={() => setValue((v) => v + 1)}
        className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                   font-bold text-2xl transition-colors active:scale-95"
      >
        ＋
      </button>
      <div className="flex gap-1.5 ml-auto">
        <button onClick={onClose}
          className="px-4 py-3 rounded-lg border border-gray-200 text-gray-500 text-sm font-bold">
          閉じる
        </button>
        <button
          onClick={() => { onSave(hole.id, value); onClose(); }}
          className="px-4 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors"
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ── ShotList ─────────────────────────────────────────────────────────
// Button order: 番手 → 球筋 → ライ

function ShotList({
  shots, editing, onToggleEdit, onUpdateClub, onUpdateLie, onUpdateBallShape, inputMode,
}: {
  shots: Shot[];
  editing: { id: string; type: "club" | "lie" | "shape" } | null;
  onToggleEdit: (id: string, type: "club" | "lie" | "shape") => void;
  onUpdateClub: (id: string, club: Club) => void;
  onUpdateLie: (id: string, lie: string) => void;
  onUpdateBallShape: (id: string, shape: string) => void;
  inputMode: "post_round" | "realtime";
}) {
  const isPostRound = inputMode === "post_round";
  return (
    <div className="space-y-1">
      {[...shots].sort((a, b) => a.shot_number - b.shot_number).map((shot) => {
        const clubOpen  = editing?.id === shot.id && editing.type === "club";
        const shapeOpen = editing?.id === shot.id && editing.type === "shape";
        const lieOpen   = editing?.id === shot.id && editing.type === "lie";
        const clubLabel = shot.club ? (CLUB_LABELS[shot.club as Club] ?? shot.club) : null;

        return (
          <div key={shot.id} className="border-b border-green-50 last:border-0">
            {/* Row: 番手 → 球筋 → ライ */}
            <div className="flex items-center justify-between py-3">
              <span className="text-base font-medium text-green-700">
                第{shot.shot_number}打
              </span>
              <div className="flex items-center gap-2">
                {shot.distance_yards && (
                  <span className="text-sm font-semibold text-green-600 tabular-nums">
                    {shot.distance_yards}y
                  </span>
                )}
                {/* ① 番手 — hidden in post_round mode (entered later in stats) */}
                {!isPostRound && (
                  <button
                    onClick={() => onToggleEdit(shot.id, "club")}
                    className={`text-sm px-3 py-2.5 rounded-lg border font-bold transition-colors ${
                      clubLabel
                        ? clubOpen
                          ? "bg-green-700 border-green-700 text-white"
                          : "bg-green-600 border-green-600 text-white"
                        : clubOpen
                          ? "bg-green-100 border-green-400 text-green-700"
                          : "bg-gray-50 border-gray-200 text-gray-400"
                    }`}
                  >
                    {clubLabel ?? "番手"}
                  </button>
                )}
                {/* ② 球筋 */}
                <button
                  onClick={() => onToggleEdit(shot.id, "shape")}
                  className={`text-sm px-3 py-2.5 rounded-lg border font-bold transition-colors ${
                    shot.ball_shape
                      ? shapeOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-100 border-green-300 text-green-700"
                      : shapeOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {shot.ball_shape ? BALL_SHAPE_SHORT[shot.ball_shape] ?? shot.ball_shape : "球筋"}
                </button>
                {/* ③ ライ */}
                <button
                  onClick={() => onToggleEdit(shot.id, "lie")}
                  className={`text-sm px-3 py-2.5 rounded-lg border font-bold transition-colors ${
                    shot.lie_type
                      ? lieOpen
                        ? "bg-green-700 border-green-700 text-white"
                        : "bg-green-100 border-green-300 text-green-700"
                      : lieOpen
                        ? "bg-green-100 border-green-400 text-green-700"
                        : "bg-gray-50 border-gray-200 text-gray-400"
                  }`}
                >
                  {lieLabelShort(shot.lie_type)}
                </button>
              </div>
            </div>

            {/* Club picker — only available in realtime mode */}
            {clubOpen && !isPostRound && (
              <div className="pb-2 space-y-1.5">
                {[WOOD_CLUBS, UTIL_CLUBS, IRON_CLUBS, WEDGE_CLUBS].map((row, i) => (
                  <div
                    key={i}
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                  >
                    {row.map((c) => (
                      <button key={c} onClick={() => onUpdateClub(shot.id, c)}
                        className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
                          shot.club === c
                            ? "bg-green-600 border-green-600 text-white"
                            : "bg-white border-green-200 text-green-800 hover:bg-green-50"
                        }`}>
                        {CLUB_LABELS[c]}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Ball shape picker */}
            {shapeOpen && (
              <div className="grid grid-cols-4 gap-1.5 pb-2">
                {BALL_SHAPE_OPTIONS.map((shape) => (
                  <button key={shape} onClick={() => onUpdateBallShape(shot.id, shape)}
                    className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
                      shot.ball_shape === shape
                        ? "bg-green-600 border-green-600 text-white"
                        : "bg-white border-green-200 text-green-700 hover:bg-green-50"
                    }`}>
                    {shape}
                  </button>
                ))}
              </div>
            )}

            {/* Lie picker (2-stage) */}
            {lieOpen && (
              <LiePicker
                shotId={shot.id}
                currentLie={shot.lie_type}
                onSave={onUpdateLie}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── LiePicker: 2-stage lie selection ─────────────────────────────────
// Stage 1: FW / 右 / 左 / ショート / オーバー
// Stage 2 (non-FW): OB / ペナ / バンカー / ラフ → count 1-8

function LiePicker({
  shotId, currentLie, onSave,
}: {
  shotId: string;
  currentLie: string | null;
  onSave: (shotId: string, lie: string) => void;
}) {
  const init = parseLieParts(currentLie);
  const [s1, setS1] = useState<LieS1 | null>(init.s1);
  const [s2, setS2] = useState<LieS2 | null>(init.s2);
  const [count, setCount] = useState<number | null>(init.count);

  function selectS1(val: LieS1) {
    setS1(val);
    setS2(null);
    setCount(null);
    if (val === "fairway") {
      onSave(shotId, "fairway");
    }
  }

  function selectS2(val: LieS2) {
    setS2(val);
    setCount(null);
  }

  function selectCount(n: number) {
    setCount(n);
    if (!s1 || !s2) return;
    onSave(shotId, `${s1}:${s2}:${n}`);
  }

  return (
    <div className="pb-2 space-y-2">
      {/* Stage 1 */}
      <div className="grid grid-cols-5 gap-1.5">
        {LIE_S1.map((val) => (
          <button key={val} onClick={() => selectS1(val)}
            className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
              s1 === val
                ? "bg-green-600 border-green-600 text-white"
                : "bg-white border-green-200 text-green-700 hover:bg-green-50"
            }`}>
            {LIE_S1_LABEL[val]}
          </button>
        ))}
      </div>

      {/* Stage 2: shown when non-fairway selected */}
      {s1 && s1 !== "fairway" && (
        <div className="grid grid-cols-4 gap-1.5">
          {LIE_S2.map((val) => (
            <button key={val} onClick={() => selectS2(val)}
              className={`py-3.5 rounded-lg text-sm font-bold border transition-colors ${
                s2 === val
                  ? "bg-orange-500 border-orange-500 text-white"
                  : "bg-white border-orange-200 text-orange-700 hover:bg-orange-50"
              }`}>
              {LIE_S2_LABEL[val]}
            </button>
          ))}
        </div>
      )}

      {/* Count 1-8: shown when stage 2 selected */}
      {s1 && s1 !== "fairway" && s2 && (
        <>
          <p className="text-sm text-gray-400 font-medium">回数</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button key={n} onClick={() => selectCount(n)}
                className={`py-3.5 rounded-lg text-base font-bold border transition-colors ${
                  count === n
                    ? "bg-gray-600 border-gray-600 text-white"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Distance measurement clubs ────────────────────────────────────────
// スタッツ(番手別集計)の対象に合わせ、types の CLUBS 全24本（putter は対象外）。
const DM_CLUBS: { value: string; label: string }[] = CLUBS.map((c) => ({
  value: c,
  label: c === "1w" ? "1W（ドライバー）" : CLUB_LABELS[c],
}));

// ── ScoreEntryCard: score mode hole completion ────────────────────────

function ScoreEntryCard({
  hole, isLastHole, onComplete, roundShotHistory, onShotDistanceRecorded, inputMode,
}: {
  hole: Hole;
  isLastHole: boolean;
  onComplete: (score: number, putts: number) => void;
  roundShotHistory: RoundShotEntry[];
  onShotDistanceRecorded: (entry: RoundShotEntry) => void;
  inputMode: "post_round" | "realtime";
}) {
  // DM panel is visible in both modes — only the per-club controls (clubドロップダウン
  // and the persist-to-shot_distances "記録する" button) are realtime-only, since
  // shot_distances.club is NOT NULL. In post_round, users still get the live
  // distance readout + in-round cumulative history.
  const dmCanSave = inputMode === "realtime";
  const [strokes, setStrokes] = useState(hole.score ?? hole.par);
  const [putts, setPutts]     = useState(hole.putts ?? 2);

  // Distance measurement state — auto-expand in post_round mode so the GPS
  // distance buttons are visible the moment the hole opens (post_round users
  // rely on DM for per-shot position capture; entry-button-then-tap is
  // friction they don't need).
  const [showDM, setShowDM]         = useState(inputMode === "post_round");
  const [showHistory, setShowHistory] = useState(false);
  const [dmStart, setDmStart]       = useState<{lat: number; lng: number} | null>(null);
  const [dmEnd, setDmEnd]           = useState<{lat: number; lng: number} | null>(null);
  const [dmLoading, setDmLoading]   = useState<"idle" | "start" | "end">("idle");
  const [dmDistance, setDmDistance] = useState<{yards: number; meters: number} | null>(null);
  const [dmClub, setDmClub]         = useState("1w");
  const [dmSaved, setDmSaved]       = useState(false);
  const [dmHistory, setDmHistory]   = useState<Array<{club: string; yards: number; meters: number}>>([]);
  // Sequential button enforcement: which action is up next
  const [nextAction, setNextAction] = useState<"before" | "after">("before");

  // Reset DM state when the hole changes (1H → 2H, etc.) — keep DM expanded
  // in post_round mode across hole changes so buttons stay visible.
  useEffect(() => {
    setShowDM(inputMode === "post_round");
    setDmStart(null);
    setDmEnd(null);
    setDmDistance(null);
    setDmSaved(false);
    setNextAction("before");
  }, [hole.id, inputMode]);

  async function handleDmStart() {
    setDmLoading("start");
    try {
      const best = await getBestShotPosition();
      if (!best) return;
      setDmStart({ lat: best.lat, lng: best.lng });
      setDmEnd(null);
      setDmDistance(null);
      setNextAction("after");
    } finally {
      setDmLoading("idle");
    }
  }

  async function handleDmEnd() {
    if (!dmStart) return;
    setDmLoading("end");
    try {
      const best = await getBestShotPosition();
      if (!best) return;
      const endLat = best.lat;
      const endLng = best.lng;
      setDmEnd({ lat: endLat, lng: endLng });
      const distM = calculateDistance(
        { latitude: dmStart.lat, longitude: dmStart.lng },
        { latitude: endLat, longitude: endLng }
      );
      const distY = metersToYards(distM);
      setDmDistance({ yards: distY, meters: Math.round(distM * 10) / 10 });
      setNextAction("before");
    } finally {
      setDmLoading("idle");
    }
  }

  async function handleDmSave() {
    if (!dmDistance) return;
    const supabase = createClient();
    // 先回り：圏外なら auth 通信を一切叩かず端末バッファへ。getSession() も失効時に
    // 更新通信（/auth/v1/token）を誘発し得るため呼ばない。user_id は未解決のまま積み、
    // flush（オンライン）時に getUser で補完する。オンライン時は従来どおり。
    if (isOffline()) {
      void putShotDistance({
        id: crypto.randomUUID(),
        club: dmClub,
        distance_yards: dmDistance.yards,
        distance_meters: dmDistance.meters,
        created_at: new Date().toISOString(),
      });
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("shot_distances").insert({
        user_id: user.id,
        club: dmClub,
        distance_yards: dmDistance.yards,
        distance_meters: dmDistance.meters,
      });
    }
    onShotDistanceRecorded({ holeNumber: hole.hole_number, club: dmClub, yards: dmDistance.yards, meters: dmDistance.meters });
    setDmHistory((prev) => [...prev, { club: dmClub, yards: dmDistance.yards, meters: dmDistance.meters }]);
    setDmSaved(true);
    setTimeout(() => {
      setDmStart(null);
      setDmEnd(null);
      setDmDistance(null);
      setDmSaved(false);
      setNextAction("before");
    }, 1500);
  }

  const diff = strokes - hole.par;
  const resultLabel =
    diff <= -2 ? "イーグル" : diff === -1 ? "バーディ" :
    diff === 0  ? "パー"     : diff === 1  ? "ボギー"   :
    diff === 2  ? "ダブル"   : `+${diff}`;

  const resultColor =
    diff <= -2 ? "text-yellow-600" : diff === -1 ? "text-red-500" :
    diff === 0  ? "text-green-600" : diff === 1  ? "text-blue-500" : "text-gray-500";

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center
                          text-white font-bold text-sm">
            {hole.hole_number}
          </div>
          <p className="text-xl font-bold text-green-800">ホール {hole.hole_number}</p>
        </div>
        <p className="text-base text-green-500">パー {hole.par}</p>
      </div>

      {/* Shot distance measurement — visible in both modes. Club picker /
          persist-save are gated by dmCanSave further below. */}
      <div className="space-y-2">
        {dmHistory.length > 0 && (
          <div className="bg-green-50 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs font-semibold text-green-500 mb-1">飛距離記録</p>
            {dmHistory.map((r, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-green-600 font-medium">
                  {DM_CLUBS.find((c) => c.value === r.club)?.label ?? r.club}
                </span>
                <span className="font-bold text-green-800 tabular-nums">
                  {r.yards}y ({Math.round(r.meters)}m)
                </span>
              </div>
            ))}
          </div>
        )}
        {!showDM ? (
          <>
            <button
              onClick={() => setShowDM(true)}
              className="w-full py-5 rounded-2xl border-2 border-green-300 bg-green-50 text-green-700
                         hover:bg-green-100 font-bold text-base transition-colors active:scale-95"
            >
              📍 このショットの飛距離を記録する
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="w-full py-1.5 text-sm text-green-600 font-medium text-center hover:underline"
            >
              📋 今日のショット記録を見る
              {roundShotHistory.length > 0 && ` (${roundShotHistory.length}件)`}
            </button>
            {showHistory && (
              <div className="bg-green-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-green-700 text-center">今日のショット記録</p>
                {roundShotHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2">まだ記録がありません</p>
                ) : (
                  <div className="space-y-1.5">
                    {roundShotHistory.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border-b border-green-100 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-green-600 font-medium w-10">{entry.holeNumber}H</span>
                        <span className="text-green-700 flex-1 text-center">
                          {DM_CLUBS.find((c) => c.value === entry.club)?.label ?? entry.club}
                        </span>
                        <span className="font-bold text-green-900 tabular-nums">
                          {entry.yards}y ({Math.round(entry.meters)}m)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-full pt-1 text-xs text-gray-400 text-center"
                >
                  閉じる
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="border-2 border-green-200 rounded-2xl p-4 space-y-3 bg-green-50">
            {dmCanSave && (
              <div>
                <p className="text-xs font-semibold text-green-600 mb-1.5">使用クラブ</p>
                <select
                  value={dmClub}
                  onChange={(e) => setDmClub(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-green-200 bg-white text-green-900
                             text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  {DM_CLUBS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={handleDmStart}
              disabled={dmLoading !== "idle" || nextAction !== "before"}
              className={`w-full py-4 rounded-2xl border-2 font-bold text-base transition-colors
                          active:scale-95 disabled:cursor-not-allowed ${
                nextAction === "before"
                  ? "border-green-600 bg-green-500 hover:bg-green-600 text-white shadow-md"
                  : "border-green-200 bg-white text-green-400 opacity-60"
              }`}
            >
              {dmLoading === "start" ? "📡 GPS取得中..." : dmStart ? "✅ 打点を記録済み" : "📍 打つ前に押してね"}
            </button>
            <button
              onClick={handleDmEnd}
              disabled={dmLoading !== "idle" || nextAction !== "after"}
              className={`w-full py-4 rounded-2xl border-2 font-bold text-base transition-colors
                          active:scale-95 disabled:cursor-not-allowed ${
                nextAction === "after"
                  ? "border-green-600 bg-green-500 hover:bg-green-600 text-white shadow-md"
                  : "border-green-200 bg-white text-green-400 opacity-60"
              }`}
            >
              {dmLoading === "end" ? "📡 GPS取得中..." : dmEnd ? "✅ 着地点を記録済み" : "📍 止まった場所で押してね"}
            </button>
            {dmDistance && (
              <div className="bg-white rounded-xl px-4 py-3 text-center border border-green-200">
                <p className="text-xs text-green-500 mb-0.5">飛距離</p>
                <p className="text-2xl font-bold text-green-900 tabular-nums">
                  {dmDistance.yards}ヤード（{Math.round(dmDistance.meters)}m）
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDM(false);
                  setDmStart(null);
                  setDmEnd(null);
                  setDmDistance(null);
                  setDmSaved(false);
                  setNextAction("before");
                }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500
                           hover:bg-gray-50 text-sm font-medium transition-colors active:scale-95"
              >
                閉じる
              </button>
              {dmDistance && dmCanSave && (
                <button
                  onClick={handleDmSave}
                  disabled={dmSaved}
                  className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white
                             font-bold text-sm transition-colors active:scale-95 disabled:opacity-60"
                >
                  {dmSaved ? "✅ 保存済み" : "記録する"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stroke counter */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-green-600 text-center">スコア（打数）</p>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setStrokes((v) => Math.max(1, v - 1))}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            −
          </button>
          <span className="text-6xl font-bold text-green-900 tabular-nums w-16 text-center">
            {strokes}
          </span>
          <button
            onClick={() => setStrokes((v) => v + 1)}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            ＋
          </button>
        </div>
        <p className={`text-center text-lg font-bold ${resultColor}`}>{resultLabel}</p>
      </div>

      {/* Putt counter */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-green-600 text-center">パット数</p>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setPutts((v) => Math.max(0, v - 1))}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            −
          </button>
          <span className="text-6xl font-bold text-green-900 tabular-nums w-16 text-center">
            {putts}
          </span>
          <button
            onClick={() => setPutts((v) => v + 1)}
            className="w-14 h-14 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       font-bold text-2xl transition-colors active:scale-95"
          >
            ＋
          </button>
        </div>
      </div>

      <button
        onClick={() => onComplete(strokes, putts)}
        className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white font-bold text-xl transition-colors"
      >
        {isLastHole ? "ラウンド終了" : "次のホールへ →"}
      </button>
    </div>
  );
}

// ── Wind compass ──────────────────────────────────────────────────────

const COMPASS_STORAGE_KEY = "golfCaddieWindCompass";

// 無操作で Wake Lock をソフト解除するまでの時間。食事・組待ち・歩行中の
// 発熱と電池消耗を止めるための値。
// 画面の点灯維持はスマホ最大の電力消費源。屋外は高輝度になるため、
// 最後の操作から60秒で画面を消して電池を温存する。ゴルフは「見る→しまう」の
// 繰り返しで、1分あれば操作に十分。画面が消えても進行中ラウンドは端末保存から
// 復元されるため、計測・スコアは失われない。
// テスト時は NEXT_PUBLIC_WAKELOCK_TIMEOUT_MS で上書き可能（無ければ60秒）。
const WAKE_LOCK_IDLE_MS = (() => {
  const raw = process.env.NEXT_PUBLIC_WAKELOCK_TIMEOUT_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
})();

// ── 計測途中状態の永続化（A）──────────────────────────────────────────
// ポケットで画面が消える→バックグラウンドでページ破棄→再読込、で揮発する
// React state（始点・shotMode）を端末に退避し、復帰時に計測を再開するためのキー。
// 既存の UNFINISHED_ROUND_FLAG（lib/gps.ts）とは別物。beforeunload では消さない。
const DM_INFLIGHT_KEY = "golf_caddie_dm_inflight";

type DmInflight = {
  roundId: string;
  holeId: string;
  holeNumber: number;
  start: { lat: number; lng: number };
  startedAt: number; // ミリ秒（Date.now()）
  shotMode: "recording";
};

function saveDmInflight(data: DmInflight): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DM_INFLIGHT_KEY, JSON.stringify(data));
  } catch {
    // ignore storage failures
  }
}

function readDmInflight(): DmInflight | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DM_INFLIGHT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DmInflight;
  } catch {
    return null;
  }
}

function clearDmInflight(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DM_INFLIGHT_KEY);
  } catch {
    // ignore storage failures
  }
}

// Symbols point to where the wind is blowing TO (not where it comes from).
// e.g. 北 (wind from north) → ↓ (blows south).
const WIND_ARROWS: Record<string, string> = {
  "北": "↓", "北東": "↙", "東": "←", "南東": "↖",
  "南": "↑", "南西": "↗", "西": "→", "北西": "↘",
};

// Direction text → compass degrees (wind FROM this direction)
const DIR_DEG: Record<string, number> = {
  "北": 0, "北東": 45, "東": 90, "南東": 135,
  "南": 180, "南西": 225, "西": 270, "北西": 315,
};

// Approximate m/s mid-value for each wind speed label
const SPEED_MS: Record<string, string> = {
  "無風": "1 m/s", "微風": "5 m/s", "普通": "9 m/s", "強風": "13 m/s",
};

function WindCompassSection({
  windDirection, windSpeed, visible, onToggle,
}: {
  windDirection?: string | null;
  windSpeed?: string | null;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      {/* Toggle row */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-sm text-sky-600">
          <span className="text-base">{windDirection ? WIND_ARROWS[windDirection] ?? "🧭" : "🧭"}</span>
          <span className="text-sky-400 text-xs">{windSpeed ?? "—"}</span>
        </div>
        <button
          onClick={onToggle}
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
            visible
              ? "bg-sky-100 border-sky-300 text-sky-700"
              : "bg-gray-100 border-gray-200 text-gray-500"
          }`}
        >
          🧭 {visible ? "OFF" : "ON"}
        </button>
      </div>

      {/* Compass */}
      {visible && <WindCompass windDirection={windDirection} windSpeed={windSpeed} />}
    </div>
  );
}

function WindCompass({
  windDirection, windSpeed,
}: {
  windDirection?: string | null;
  windSpeed?: string | null;
}) {
  const deg       = windDirection ? (DIR_DEG[windDirection] ?? 0) : 0;
  const speedText = windSpeed ? (SPEED_MS[windSpeed] ?? windSpeed) : null;
  // SVG constants
  const cx = 100, cy = 100, r = 80;

  return (
    <div className="flex flex-col items-center gap-1 w-[62vw] max-w-[240px] mx-auto">
      <svg viewBox="0 0 200 200" className="w-full">
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#bae6fd" strokeWidth="1.5" />
        {/* Inner ring */}
        <circle cx={cx} cy={cy} r={r * 0.4} fill="none" stroke="#e0f2fe" strokeWidth="1" strokeDasharray="3 3" />
        {/* Crosshair — horizontal */}
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy}
              stroke="#7dd3fc" strokeWidth="1" strokeDasharray="5 4" />
        {/* Crosshair — vertical */}
        <line x1={cx} y1={cy - r} x2={cx} y2={cy + r}
              stroke="#7dd3fc" strokeWidth="1" strokeDasharray="5 4" />
        {/* Cardinal labels */}
        <text x={cx}      y={cy - r - 7}  textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">北</text>
        <text x={cx}      y={cy + r + 17} textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">南</text>
        <text x={cx + r + 13} y={cy + 5}  textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">東</text>
        <text x={cx - r - 13} y={cy + 5}  textAnchor="middle" fontSize="13" fill="#0ea5e9" fontWeight="700">西</text>
        {/* Rotating wind arrow group — rotated by deg+180 so the arrowhead points to
            where the wind is blowing TO (not where it comes from). */}
        <g transform={`rotate(${(deg + 180) % 360} ${cx} ${cy})`}>
          {/* Shaft */}
          <line x1={cx} y1={cy + 48} x2={cx} y2={cy - 52}
                stroke="#0284c7" strokeWidth="3" strokeLinecap="round" />
          {/* Arrowhead (= wind destination direction after rotation) */}
          <polygon
            points={`${cx},${cy - 66} ${cx - 9},${cy - 50} ${cx + 9},${cy - 50}`}
            fill="#0284c7"
          />
          {/* Tail feathers */}
          <line x1={cx - 9} y1={cy + 48} x2={cx} y2={cy + 34}
                stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
          <line x1={cx + 9} y1={cy + 48} x2={cx} y2={cy + 34}
                stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={4} fill="#0284c7" />
      </svg>

      {/* Speed label */}
      {speedText && (
        <p className="text-sky-600 text-sm font-semibold tabular-nums">{speedText}</p>
      )}
    </div>
  );
}

// ── Round end confirmation screen ───────────────────────────────────

function RoundEndScreen({ onConfirm, confirming }: { onConfirm: () => void; confirming?: boolean }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-green-50 to-white">
      <div className="flex flex-col items-center gap-5 max-w-sm w-full">
        <img
          src="/characters/ai.png"
          alt="AIキャディ"
          className="w-28 h-28 object-contain drop-shadow-md"
        />
        <div className="bg-white border border-green-200 rounded-2xl p-5 shadow-sm text-center space-y-1">
          <p className="text-green-800 text-xl leading-relaxed">
            今日はお疲れ様でした。ディボット跡やバンカーの足跡、グリーン上でのボールマークの修復、ありがとうございました！
          </p>
        </div>
        <p className="text-green-500 text-lg text-center">
          GPS機能とゴルフ場データとの接続を終了します。
        </p>
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-base font-bold transition-colors shadow-md disabled:opacity-60"
        >
          {confirming ? "集計中..." : "ラウンド終了"}
        </button>
      </div>
    </div>
  );
}

// ── Final round-end confirmation modal (full 18H + OUT/IN/TOTAL) ─────

function FinalConfirmModal({
  holes, startHole, courseHoles, onConfirm, onCancel,
}: {
  holes: Hole[];
  startHole: number;
  courseHoles?: { hole_number: number; par: number }[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const playOrder = Array.from({ length: 18 }, (_, i) => ((startHole - 1 + i) % 18) + 1);
  const holeMap = Object.fromEntries(holes.map((h) => [h.hole_number, h]));
  const outOrder = playOrder.slice(0, 9);
  const inOrder  = playOrder.slice(9);

  function parOf(n: number): number | null {
    return holeMap[n]?.par ?? courseHoles?.find((c) => c.hole_number === n)?.par ?? null;
  }

  const sumP   = (nums: number[]) => nums.reduce((s, n) => s + (parOf(n) ?? 0), 0);
  const sumScr = (nums: number[]) => nums.reduce((s, n) => s + (holeMap[n]?.score ?? 0), 0);
  const sumPtt = (nums: number[]) => nums.reduce((s, n) => s + (holeMap[n]?.putts ?? 0), 0);

  const outP = sumP(outOrder), outScore = sumScr(outOrder), outPutts = sumPtt(outOrder);
  const inP  = sumP(inOrder),  inScore  = sumScr(inOrder),  inPutts  = sumPtt(inOrder);
  const totalP = outP + inP, totalScore = outScore + inScore, totalPutts = outPutts + inPutts;

  const missing = playOrder.filter((n) => holeMap[n]?.score == null);

  function holeRow(n: number) {
    const hole = holeMap[n];
    const par = parOf(n);
    const score = hole?.score ?? null;
    const putts = hole?.putts ?? null;
    const isMissing = score == null;
    return (
      <tr key={n} className={`border-b border-gray-100 ${isMissing ? "bg-amber-50" : ""}`}>
        <td className="py-1 px-2 text-left text-gray-700 font-medium tabular-nums">{n}</td>
        <td className="py-1 px-2 text-center text-gray-500 tabular-nums">{par ?? "-"}</td>
        <td className={`py-1 px-2 text-center tabular-nums font-medium ${isMissing ? "text-amber-700" : "text-gray-800"}`}>
          {score ?? "—"}
        </td>
        <td className="py-1 px-2 text-center text-gray-500 tabular-nums">{putts ?? "—"}</td>
      </tr>
    );
  }

  function sumRow(label: string, p: number, s: number, pt: number, emphasize = false) {
    const trCls = emphasize
      ? "border-t-2 border-b-2 border-gray-400 bg-gray-200"
      : "border-b-2 border-gray-300 bg-gray-100";
    return (
      <tr key={label} className={`${trCls} font-bold`}>
        <td className="py-1.5 px-2 text-left text-gray-700">{label}</td>
        <td className="py-1.5 px-2 text-center text-gray-700 tabular-nums">{p || "-"}</td>
        <td className="py-1.5 px-2 text-center text-gray-900 tabular-nums">{s || "-"}</td>
        <td className="py-1.5 px-2 text-center text-gray-700 tabular-nums">{pt || "-"}</td>
      </tr>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="p-5 pb-3 border-b border-gray-100 text-center space-y-1">
          <h2 className="text-xl font-bold text-red-700">🏁 ラウンド終了確認</h2>
          <p className="text-base text-gray-600 leading-relaxed">
            この内容で終了しますか？修正があれば戻って修正してください。
          </p>
          {missing.length > 0 && (
            <p className="text-base text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2 leading-relaxed">
              ⚠️ 未入力ホールがあります（{missing.map((n) => `${n}H`).join("、")}）
            </p>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-3 pb-2">
          <table className="w-full text-lg">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-gray-400 text-base border-b border-gray-200">
                <th className="py-1.5 px-2 text-left font-medium">H</th>
                <th className="py-1.5 px-2 text-center font-medium">P</th>
                <th className="py-1.5 px-2 text-center font-medium">打</th>
                <th className="py-1.5 px-2 text-center font-medium">パ</th>
              </tr>
            </thead>
            <tbody>
              {outOrder.map(holeRow)}
              {sumRow("OUT", outP, outScore, outPutts)}
              {inOrder.map(holeRow)}
              {sumRow("IN", inP, inScore, inPutts)}
              {sumRow("TOTAL", totalP, totalScore, totalPutts, true)}
            </tbody>
          </table>
        </div>

        <div className="p-4 pt-3 border-t border-gray-100 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                       text-lg font-bold transition-colors"
          >
            戻って修正する
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800
                       text-white text-lg font-bold transition-colors"
          >
            この内容で終了する
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Beta-period completion modal (replaces payment modal while NEXT_PUBLIC_BETA_MODE=true) ─

function BetaCompleteModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div className="text-center space-y-2">
          <span className="text-4xl">🎉</span>
          <h2 className="text-lg font-bold text-green-800">お疲れさまでした！</h2>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed text-center whitespace-pre-line">
          {`現在はテスト期間中です。
課金は不要で、ラウンドデータは
そのまま保存されました。

引き続きご自由にお試しください。`}
        </p>
        <Link
          href="/history"
          onClick={onClose}
          className="block w-full text-center py-3 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                     text-white text-sm font-bold transition-colors"
        >
          スタッツを見る
        </Link>
      </div>
    </div>
  );
}

// ── Payment required modal (post-pay round flow) ────────────────────

function PaymentRequiredModal({
  onPay, onClose, loading, error,
}: {
  onPay: () => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div className="text-center space-y-2">
          <span className="text-4xl">💳</span>
          <h2 className="text-lg font-bold text-green-800">決済のお願い</h2>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          本日のラウンドデータを保存するには、<strong>本日23:59まで</strong>の決済が必要です。
          未決済の場合、<strong>明日午前0:30にデータは自動削除</strong>されます。
        </p>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-xs text-green-700">ラウンド利用料</p>
          <p className="text-2xl font-bold text-green-800">220円</p>
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠️ {error}
          </p>
        )}
        <button
          onClick={onPay}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                     text-white text-sm font-bold transition-colors disabled:opacity-60"
        >
          {loading ? "決済ページへ移動中..." : "今すぐ決済する"}
        </button>
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full text-xs text-gray-500 underline"
        >
          あとで決済する
        </button>
      </div>
    </div>
  );
}

// ── Round complete ──────────────────────────────────────────────────

function RoundComplete({
  holes, totalScore, totalPar, mode, handicapDiff, paymentPending, onPayNow,
  pastView = false, onUpdateHole, avgDriverYards = null, maxDriverYards = null,
}: {
  holes: Hole[];
  totalScore: number;
  totalPar: number;
  mode: "shot" | "score";
  handicapDiff?: number | null;
  paymentPending?: boolean;
  onPayNow?: () => void;
  pastView?: boolean;
  onUpdateHole?: (holeId: string, update: Partial<Hole>) => Promise<void>;
  avgDriverYards?: number | null;
  maxDriverYards?: number | null;
}) {
  const diff       = totalScore - totalPar;
  const totalPutts = holes.reduce((s, h) => s + (h.putts ?? 0), 0);
  const out        = holes.slice(0, 9).reduce((s, h) => s + (h.score ?? 0), 0);
  const outPutts   = holes.slice(0, 9).reduce((s, h) => s + (h.putts ?? 0), 0);
  const outPar     = holes.slice(0, 9).reduce((s, h) => s + h.par, 0);
  const inn        = holes.slice(9).reduce((s, h)  => s + (h.score ?? 0), 0);
  const innPutts   = holes.slice(9).reduce((s, h)  => s + (h.putts ?? 0), 0);
  const innPar     = holes.slice(9).reduce((s, h)  => s + h.par, 0);

  // ホール毎のショット数算出と同じ式で OUT/IN 合計を出す（score / shot モードで分岐）
  const holeShots = (h: Hole) =>
    mode === "score"
      ? (h.score ?? 0) - (h.putts ?? 0)
      : h.shots.length + (h.penalties ?? 0);
  const outShots = holes.slice(0, 9).reduce((s, h) => s + holeShots(h), 0);
  const innShots = holes.slice(9).reduce((s, h)  => s + holeShots(h), 0);

  const isEditable = pastView && mode === "score" && !!onUpdateHole;

  // ── Inline edit state（セルタップ → input → blur で保存） ─────────────
  type EditField = "par" | "shots" | "putts";
  const [editing, setEditing] = useState<{ holeId: string; field: EditField } | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(hole: Hole, field: EditField) {
    let current: number | null;
    if (field === "par") current = hole.par;
    else if (field === "putts") current = hole.putts;
    else current = hole.score != null ? (hole.score - (hole.putts ?? 0)) : null;
    setEditValue(current != null ? String(current) : "");
    setEditing({ holeId: hole.id, field });
  }

  async function commitEdit() {
    const e = editing;
    setEditing(null);
    if (!e || !onUpdateHole) return;
    const hole = holes.find((h) => h.id === e.holeId);
    if (!hole) return;
    const trimmed = editValue.trim();
    if (trimmed === "") return;
    const num = parseInt(trimmed, 10);
    if (isNaN(num) || num < 0 || num > 20) return;

    let update: Partial<Hole>;
    if (e.field === "par") {
      if (num === hole.par) return;
      update = { par: num };
    } else if (e.field === "putts") {
      const curPutts = hole.putts;
      if (num === curPutts) return;
      const curShots = hole.score != null ? hole.score - (curPutts ?? 0) : 0;
      update = { putts: num, score: curShots + num };
    } else {
      const curShots = hole.score != null ? hole.score - (hole.putts ?? 0) : null;
      if (num === curShots) return;
      update = { score: num + (hole.putts ?? 0) };
    }
    await onUpdateHole(hole.id, update);
  }

  function ScoreBadge({ score, par }: { score: number | null; par: number }) {
    const box = "inline-flex items-center justify-center w-7 h-7 font-bold tabular-nums text-base";
    if (score == null) return <span className={`${box} text-gray-400`}>—</span>;
    // 〇□囲みは廃止。計の数字をパーとの差で色分け（金/赤/黒/青/濃青）。
    return <span className={box} style={{ color: getScoreColor(score, par) }}>{score}</span>;
  }

  function EditableCell({
    hole, field, displayValue, baseClass,
  }: {
    hole: Hole;
    field: EditField;
    displayValue: React.ReactNode;
    baseClass: string;
  }) {
    const isThisEditing = editing?.holeId === hole.id && editing?.field === field;
    if (isThisEditing) {
      return (
        <td className="py-0.5 text-center">
          <input
            type="number"
            inputMode="numeric"
            autoFocus
            value={editValue}
            onChange={(ev) => setEditValue(ev.target.value)}
            onBlur={commitEdit}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") (ev.currentTarget as HTMLInputElement).blur();
              if (ev.key === "Escape") setEditing(null);
            }}
            className="w-10 text-center text-[11px] tabular-nums border border-green-400 rounded outline-none px-0.5 py-0.5"
          />
        </td>
      );
    }
    if (!isEditable) {
      return <td className={baseClass}>{displayValue}</td>;
    }
    return (
      <td className={baseClass}>
        <button
          type="button"
          onClick={() => startEdit(hole, field)}
          className="w-full rounded hover:bg-green-50 active:bg-green-100"
        >
          {displayValue}
        </button>
      </td>
    );
  }

  function ScoreColumn({
    label, slice, pSum, sSum, ptSum, shSum,
  }: {
    label: string;
    slice: Hole[];
    pSum: number;
    sSum: number;
    ptSum: number;
    shSum: number;
  }) {
    return (
      <div>
        <p className="text-center text-[11px] font-bold text-green-700 mb-1">{label}</p>
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr className="text-green-500 text-[10px] border-b border-green-100">
              <th className="text-left py-0.5">H</th>
              <th className="text-center py-0.5">Par</th>
              <th className="text-center py-0.5 text-[9px]">ショット</th>
              <th className="text-center py-0.5">P</th>
              <th className="text-center py-0.5">計</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((hole) => {
              const shots = holeShots(hole);
              return (
                <tr key={hole.id} className="border-b border-green-50">
                  <td className="py-1 text-green-700 font-medium">{hole.hole_number}</td>
                  <EditableCell
                    hole={hole} field="par"
                    displayValue={hole.par}
                    baseClass="py-1 text-center text-green-500"
                  />
                  <EditableCell
                    hole={hole} field="shots"
                    displayValue={hole.score != null ? shots : "—"}
                    baseClass="py-1 text-center text-green-700"
                  />
                  <EditableCell
                    hole={hole} field="putts"
                    displayValue={hole.putts ?? "—"}
                    baseClass="py-1 text-center text-green-500"
                  />
                  <td className="py-1 text-center">
                    <ScoreBadge score={hole.score} par={hole.par} />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-green-200 bg-green-50 font-bold text-green-700">
              <td className="py-1 text-left">{label}</td>
              <td className="py-1 text-center">{pSum || "—"}</td>
              <td className="py-1 text-center">{shSum || "—"}</td>
              <td className="py-1 text-center">{ptSum || "—"}</td>
              <td className="py-1 text-center">{sSum || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-green-600 text-white rounded-2xl p-4 text-center">
        <p className="text-sm opacity-80">ラウンド完了</p>
        <p className="mt-0.5 flex items-baseline justify-center tabular-nums">
          <span className="text-5xl font-bold">{totalScore}</span>
          <span className="text-2xl font-normal opacity-80 ml-2">/ {totalPutts}P</span>
          <span className="text-2xl font-normal opacity-90 ml-3">
            {diff === 0 ? "イーブン" : diff > 0 ? `+${diff}` : `${diff}`}
          </span>
        </p>
        {holes.length === 18 && (
          <p className="text-sm opacity-70 mt-1">
            OUT {out} / {outPutts}P　IN {inn} / {innPutts}P
          </p>
        )}
        {(avgDriverYards != null || maxDriverYards != null) && (
          <p className="text-sm opacity-70 mt-1">
            🏌️ ドライバー
            {avgDriverYards != null && <span className="ml-1">平均 {avgDriverYards}y</span>}
            {avgDriverYards != null && maxDriverYards != null && <span className="mx-1">/</span>}
            {maxDriverYards != null && <span>最長 {maxDriverYards}y</span>}
          </p>
        )}
      </div>

      {paymentPending && onPayNow && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-xl">⚠️</span>
            <p className="text-sm text-amber-900 leading-relaxed">
              <strong>未決済です。</strong>本日23:59までに決済を完了してください。
              未決済の場合、明日午前0:30にこのラウンドのデータは自動削除されます。
            </p>
          </div>
          <button
            onClick={onPayNow}
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800
                       text-white text-sm font-bold transition-colors"
          >
            今すぐ220円を決済する
          </button>
        </div>
      )}

      {handicapDiff != null && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-1">
          <p className="text-xs text-amber-600 font-medium">ハンディキャップ差分（参考）</p>
          <p className="text-3xl font-bold tabular-nums text-amber-800">{handicapDiff}</p>
          <p className="text-xs text-amber-500">
            JGA方式に準じた計算です。公式ハンディキャップではありません。
          </p>
        </div>
      )}

      {/* Scorecard — OUT/IN side-by-side (golf standard format) */}
      <div className="card">
        {isEditable && (
          <p className="text-[10px] text-green-500 text-center mb-2">
            📝 セルをタップで編集できます（ショット + P = 計）
          </p>
        )}
        {holes.length > 9 ? (
          <div className="grid grid-cols-2">
            <div className="pr-2">
              <ScoreColumn label="OUT" slice={holes.slice(0, 9)} pSum={outPar} sSum={out} ptSum={outPutts} shSum={outShots} />
            </div>
            <div className="pl-2 border-l border-green-100">
              <ScoreColumn label="IN" slice={holes.slice(9)} pSum={innPar} sSum={inn} ptSum={innPutts} shSum={innShots} />
            </div>
          </div>
        ) : (
          <ScoreColumn label="OUT" slice={holes} pSum={outPar} sSum={out} ptSum={outPutts} shSum={outShots} />
        )}
        <p className="text-[11px] text-gray-600 text-center mt-2 leading-relaxed">
          「計」の数字の色：
          <span style={{ color: "#FFD700" }} className="font-bold">■</span>イーグル以上 ·{" "}
          <span style={{ color: "#E53935" }} className="font-bold">■</span>バーディー ·{" "}
          <span style={{ color: "#000000" }} className="font-bold">■</span>パー ·{" "}
          <span style={{ color: "#1E88E5" }} className="font-bold">■</span>ボギー ·{" "}
          <span style={{ color: "#1A237E" }} className="font-bold">■</span>ダブルボギー以上
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2-1 unified-UI subcomponents (single-screen layout)
// ─────────────────────────────────────────────────────────────────────

// ── ScoreTable: 4-row × 18-col + end-round cell ─────────────────────

function ScoreTable({
  holes, startHole, courseHoles, currentHoleNumber, onSelectHole, onEndRound,
}: {
  holes: Hole[];
  startHole: number;
  courseHoles?: { hole_number: number; par: number }[];
  currentHoleNumber: number;
  onSelectHole: (n: number) => void;
  onEndRound: () => void;
}) {
  const playOrder = Array.from({ length: 18 }, (_, i) => ((startHole - 1 + i) % 18) + 1);
  const holeMap = Object.fromEntries(holes.map((h) => [h.hole_number, h]));
  const colRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => {
    colRefs.current[currentHoleNumber]?.scrollIntoView({
      behavior: "smooth", block: "nearest", inline: "center",
    });
  }, [currentHoleNumber]);

  function cellCls(n: number, row: "H" | "P" | "score" | "putts") {
    const active = n === currentHoleNumber;
    if (!active) {
      if (row === "H") return "bg-green-50 text-green-700 font-bold";
      if (row === "P") return "bg-white text-green-500";
      return "bg-white text-green-700";
    }
    if (row === "H") return "bg-green-600 text-white font-bold";
    return "bg-green-100 text-green-800 font-bold";
  }

  function holeCol(n: number) {
    const hole = holeMap[n] as Hole | undefined;
    const par = hole?.par ?? courseHoles?.find((c) => c.hole_number === n)?.par ?? null;
    const scoreTxt = hole?.score != null ? String(hole.score) : "";
    const puttsTxt = hole?.putts != null ? String(hole.putts) : "";
    return (
      <button
        key={n}
        ref={(el) => { colRefs.current[n] = el; }}
        onClick={() => onSelectHole(n)}
        className="flex flex-col gap-0.5 active:scale-95 transition-transform"
      >
        <div className={`w-12 h-10 rounded-t-md flex items-center justify-center text-xl tabular-nums ${cellCls(n, "H")}`}>
          {n}
        </div>
        <div className={`w-12 h-10 flex items-center justify-center text-xl tabular-nums ${cellCls(n, "P")}`}>
          {par ?? "-"}
        </div>
        {/* 「打」セル: 完了画面スコアカードと同じ getScoreColor でパー差により色分け。
            スコア未入力のセルは従来どおり無色（inline style を当てない）。 */}
        <div
          className={`w-12 h-10 flex items-center justify-center text-xl tabular-nums ${cellCls(n, "score")}`}
          style={hole?.score != null && par != null ? { color: getScoreColor(hole.score, par) } : undefined}
        >
          {scoreTxt}
        </div>
        <div className={`w-12 h-10 rounded-b-md flex items-center justify-center text-xl tabular-nums ${cellCls(n, "putts")}`}>
          {puttsTxt}
        </div>
      </button>
    );
  }

  function summaryCol(label: string, nums: number[]) {
    const parSum = nums.reduce((s, n) => {
      const par = holeMap[n]?.par ?? courseHoles?.find((c) => c.hole_number === n)?.par ?? null;
      return s + (par ?? 0);
    }, 0);
    const scoreSum = nums.reduce((s, n) => s + (holeMap[n]?.score ?? 0), 0);
    const puttsSum = nums.reduce((s, n) => s + (holeMap[n]?.putts ?? 0), 0);
    const cell = "w-16 h-10 flex items-center justify-center text-xl tabular-nums bg-gray-200 text-gray-700 font-bold";
    return (
      <div key={label} className="flex flex-col gap-0.5 ml-0.5">
        {/* TOTAL ラベルが w-16 に収まるよう text-base に抑制（text-xl だと "TOTAL" 5字が幅オーバー） */}
        <div className={`${cell} rounded-t-md !text-base`}>{label}</div>
        <div className={cell}>{parSum || ""}</div>
        <div className={cell}>{scoreSum || ""}</div>
        <div className={`${cell} rounded-b-md`}>{puttsSum || ""}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4 sticky top-0 z-10 bg-white border-b border-green-100 py-1">
      <div className="flex items-stretch gap-0.5 min-w-max">
        {/* Row labels (sticky left) — h-10 leading-10 でセル高さと揃える */}
        <div className="flex flex-col gap-0.5 pr-1 text-base font-bold text-green-400 text-right">
          <div className="h-10 leading-10">H</div>
          <div className="h-10 leading-10">P</div>
          <div className="h-10 leading-10">打</div>
          <div className="h-10 leading-10">パ</div>
        </div>
        {/* First 9 hole columns + OUT summary */}
        {playOrder.slice(0, 9).map(holeCol)}
        {summaryCol("OUT", playOrder.slice(0, 9))}
        {/* Last 9 hole columns + IN summary */}
        {playOrder.slice(9).map(holeCol)}
        {summaryCol("IN", playOrder.slice(9))}
        {/* TOTAL summary (all 18 holes) */}
        {summaryCol("TOTAL", playOrder)}
        {/* End-round cell */}
        <button
          onClick={onEndRound}
          aria-label="ラウンドを終了する"
          className="ml-0.5 w-10 flex flex-col items-center justify-center
                     bg-red-600 hover:bg-red-700 active:bg-red-800 text-white
                     rounded-md font-bold transition-colors active:scale-95 shadow-sm"
        >
          <span className="text-lg leading-none">🏁</span>
          <span className="text-[10px] mt-0.5">終了</span>
        </button>
      </div>
    </div>
  );
}

// CompactCompass moved to ./CompactCompass.tsx

// ── IdleShotSection: collapsed-state entry + last-shot memo + club hint ──

function IdleShotSection({
  disabled, onStart, lastShot, error,
}: {
  disabled: boolean;
  onStart: () => void;
  lastShot: LastShotMemo | null;
  error: string | null;
}) {
  return (
    <div className="space-y-1.5">
      {error && (
        <p className="text-center text-lg text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠️ 保存に失敗しました：{error}
        </p>
      )}
      {lastShot && (
        <p className="text-center text-lg text-gray-600 tabular-nums">
          📊 直前のショット：第{lastShot.shotNumber}打 {lastShot.distanceYards}ヤード（{lastShot.distanceMeters}m）
        </p>
      )}
      <button
        onClick={onStart}
        disabled={disabled}
        className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white font-bold text-lg shadow-md transition-colors active:scale-95
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ⛳ 飛距離を測る
      </button>
      <p className="text-center text-base text-gray-500 mt-2">
        使ったクラブは「スタッツ」画面で後から記録できます
      </p>
    </div>
  );
}

// ── ActiveShotPanel: full 3-step record flow (DM start → end → confirm) ─

function ActiveShotPanel({
  hasCurrentHole, creating,
  dmStart, dmEnd, dmDistance, dmLoading, shotCount, confirming, lastShot,
  onShotStart, onShotEnd, onConfirmShot, onCancel,
}: {
  hasCurrentHole: boolean;
  creating: boolean;
  dmStart: { lat: number; lng: number } | null;
  dmEnd: { lat: number; lng: number } | null;
  dmDistance: { yards: number; meters: number } | null;
  dmLoading: "idle" | "start" | "end";
  shotCount: number;
  confirming: boolean;
  lastShot: LastShotMemo | null;
  onShotStart: () => void;
  onShotEnd: () => void;
  onConfirmShot: () => void;
  onCancel: () => void;
}) {
  const disabled = !hasCurrentHole || creating;

  const startDone = !!dmStart;
  const endDone   = !!dmEnd;

  // 2s feedback panel after "このショットを記録する" tap. Gated on `confirming`
  // alone — `lastShot` is used for display if present, with a safe fallback to
  // the in-flight values so the panel never collapses unexpectedly.
  if (confirming) {
    const shotNumber = lastShot?.shotNumber ?? shotCount + 1;
    const yards = lastShot?.distanceYards ?? dmDistance?.yards;
    const meters = lastShot?.distanceMeters ?? dmDistance?.meters;
    return (
      <div className="w-full py-5 rounded-2xl bg-gray-100 border-2 border-gray-200
                      text-center space-y-1.5 shadow-inner">
        <p className="text-xl font-bold text-gray-700">
          ✅ 第{shotNumber}打 記録しました
        </p>
        {yards != null && meters != null && (
          <p className="text-lg text-gray-600 tabular-nums">
            飛距離 {yards}ヤード（{meters}m）
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* 打つ前: vivid green until tapped, then pale-green disabled ✅ */}
      <button
        onClick={onShotStart}
        disabled={disabled || dmLoading !== "idle" || startDone || confirming}
        className={`w-full py-3.5 rounded-2xl font-bold text-lg transition-colors
                    active:scale-95 disabled:cursor-not-allowed ${
          startDone
            ? "bg-green-50 text-gray-500 border-2 border-green-100"
            : "bg-green-500 hover:bg-green-600 text-white shadow-md border-2 border-green-600"
        }`}
      >
        {dmLoading === "start"
          ? "📡 GPS取得中..."
          : startDone
            ? "✅ 打点を記録済み"
            : `📍 第${shotCount + 1}打 打つ前に押してね`}
      </button>

      {/* 止まった場所: grey-disabled until 打つ前 done; vivid when active; pale-green ✅ after */}
      <button
        onClick={onShotEnd}
        disabled={disabled || dmLoading !== "idle" || !startDone || endDone || confirming}
        className={`w-full py-3.5 rounded-2xl font-bold text-lg transition-colors
                    active:scale-95 disabled:cursor-not-allowed ${
          endDone
            ? "bg-green-50 text-gray-500 border-2 border-green-100"
            : startDone
              ? "bg-green-500 hover:bg-green-600 text-white shadow-md border-2 border-green-600"
              : "bg-gray-100 text-gray-400 border-2 border-gray-200"
        }`}
      >
        {dmLoading === "end"
          ? "📡 GPS取得中..."
          : endDone
            ? "✅ 着地点を記録済み"
            : "📍 止まった場所で押してね"}
      </button>

      {/* 距離メーター（飛距離表示）— 常時表示。
          dmStart 未設定 / 計測前: 「📍 0Y / 0m」を初期表示
          dmStart → dmEnd 中: pair-scoped watchPosition のライブ値で更新
          dmEnd 確定後: 最終直線距離を表示（confirm／cancel で 0/0 に戻る） */}
      <div className="text-center py-1">
        <span className="text-2xl font-bold text-green-900 tabular-nums">
          📍 {Math.round(dmDistance?.yards ?? 0)}Y
        </span>
        <span className="text-xl text-green-600 tabular-nums ml-2">
          / {Math.round(dmDistance?.meters ?? 0)}m
        </span>
      </div>


      {/* Confirm — INSERT into shots. While confirming, the early-return above swaps
          this for a feedback panel — this branch only renders the active button. */}
      {dmDistance && (
        <button
          onClick={onConfirmShot}
          disabled={disabled || confirming}
          className="w-full py-3.5 rounded-2xl font-bold text-base transition-colors
                     active:scale-95 shadow-md disabled:cursor-not-allowed
                     bg-green-700 hover:bg-green-800 active:bg-green-900 text-white"
        >
          このショットを記録する
        </button>
      )}

      {/* Cancel — always visible while recording; small, discreet blue underline */}
      {!confirming && (
        <button
          onClick={onCancel}
          className="block mx-auto text-base text-blue-600 hover:text-blue-800 underline py-1"
        >
          キャンセル
        </button>
      )}
    </div>
  );
}

// ── CompactScoreEntry: tap value → numeric keypad modal ──────────────

function CompactScoreEntry({
  par, score, putts, onParChange, onScoreChange, onPuttsChange,
}: {
  par: number | null;
  score: number | null;
  putts: number | null;
  onParChange: (par: number) => void;
  onScoreChange: (score: number) => void;
  onPuttsChange: (putts: number) => void;
}) {
  return (
    <div className="card !p-2 grid grid-cols-3 gap-2">
      <KeypadEntryRow label="パー"   value={par}   min={3} max={7}  onChange={onParChange} />
      <KeypadEntryRow label="打数"   value={score} min={1} max={99} onChange={onScoreChange} />
      <KeypadEntryRow label="パット" value={putts} min={0} max={99} onChange={onPuttsChange} />
    </div>
  );
}

// One row: label + current-value chip. Tap the chip to open the keypad.
function KeypadEntryRow({
  label, value, min, max, onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col items-center gap-1">
        <span className="text-base font-semibold text-green-700">{label}</span>
        <button
          onClick={() => setOpen(true)}
          className="w-full h-12 rounded-xl border-2 border-green-300 bg-white hover:bg-green-50
                     active:bg-green-100 active:scale-[0.98] text-2xl font-bold text-green-700
                     tabular-nums transition-colors"
        >
          {value ?? "—"}
        </button>
      </div>
      {open && (
        <NumericKeypadModal
          label={label}
          initialValue={value}
          min={min}
          max={max}
          onConfirm={(n) => { onChange(n); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Phone-dial style keypad: 1-9 grid, ⌫ / 0 / 確定 on the bottom row.
// Large hit targets for glove + one-hand use on the course.
function NumericKeypadModal({
  label, initialValue, min, max, onConfirm, onClose,
}: {
  label: string;
  initialValue: number | null;
  min: number;
  max: number;
  onConfirm: (n: number) => void;
  onClose: () => void;
}) {
  const maxLen = String(max).length;
  const [input, setInput] = useState<string>(initialValue != null ? String(initialValue) : "");
  // Once the user starts typing, the first digit replaces the seeded value
  // rather than appending — matches phone-dial expectations when re-editing.
  const [touched, setTouched] = useState(false);

  function press(digit: string) {
    setInput((cur) => {
      const base = touched ? cur : "";
      const next = (base + digit).replace(/^0+(?=\d)/, "");
      if (next.length > maxLen) return cur;
      return next;
    });
    setTouched(true);
  }
  function backspace() {
    setInput((cur) => (touched ? cur : "").slice(0, -1));
    setTouched(true);
  }

  const parsed = input === "" ? null : parseInt(input, 10);
  const valid = parsed !== null && parsed >= min && parsed <= max;

  function handleConfirm() {
    if (!valid || parsed == null) return;
    onConfirm(parsed);
  }

  return (
    <div
      role="dialog"
      aria-label={`${label}を入力`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-bold text-green-800">{label}を入力</h3>
          <span className="text-xs text-gray-500">範囲: {min}〜{max}</span>
        </div>

        <div className="h-16 rounded-xl border-2 border-green-300 bg-green-50 flex items-center justify-center">
          <span className="text-4xl font-bold text-green-700 tabular-nums">
            {input === "" ? "—" : input}
          </span>
        </div>

        <p
          className={`text-sm text-center min-h-[1.25rem] ${
            input !== "" && !valid ? "text-red-600" : "text-transparent"
          }`}
        >
          {min}〜{max}の範囲で入力してください
        </p>

        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9"].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300
                         active:scale-95 text-2xl font-bold text-gray-800 transition-colors"
            >
              {k}
            </button>
          ))}
          <button
            onClick={backspace}
            disabled={input === ""}
            className="h-14 rounded-xl bg-gray-200 hover:bg-gray-300 active:bg-gray-400
                       active:scale-95 text-xl font-bold text-gray-700 transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="1文字消す"
          >
            ⌫
          </button>
          <button
            onClick={() => press("0")}
            className="h-14 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300
                       active:scale-95 text-2xl font-bold text-gray-800 transition-colors"
          >
            0
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valid}
            className="h-14 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800
                       active:scale-95 text-base font-bold text-white shadow-sm transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
          >
            確定
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700
                     text-sm font-medium transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

