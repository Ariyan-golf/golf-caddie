"use client";

// Single-shot GPS module + pair-scoped watchPosition for live shot distance.
// Default reads are one-shot getCurrentPosition triggered by user actions
// (打つ前 / 止まった場所 / グリーンセンター / 残り距離 / 天気自動取得) — this
// keeps battery drain low, since continuous watchPosition drained ~50% in 9
// holes (5/16 大隅CC).
// startShotWatch() temporarily opens watchPosition during a 打つ前→止まった場所
// pair so the live "📍 0Y / 0m" distance meter can tick. The watch auto-stops
// on 止まった場所, on 15-min timeout, or on round cleanup.

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

const MAX_TRACKING_DURATION_MS = 6 * 60 * 60 * 1000;
const UNFINISHED_ROUND_FLAG = "golf_caddie_round_in_progress";
const AUTO_STOPPED_FLAG = "golf_caddie_gps_auto_stopped";

const SHARED_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

// 「打つ前」押下後15分経過したら強制停止＋計測リセット。
// ボール探し最大10分+組待ち5分を想定、これを超えたら押し忘れ判定。
// watchPosition の暴走を防いで電池保護。
// テスト時は NEXT_PUBLIC_SHOT_TIMEOUT_MS で短縮可能（例: "10000" → 10秒）。
function resolveShotTimeoutMs(): number {
  const raw = process.env.NEXT_PUBLIC_SHOT_TIMEOUT_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 15 * 60 * 1000;
}

let active = false;
let lastPosition: GpsPoint | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let beforeUnloadHandler: (() => void) | null = null;

// Pair-scoped watchPosition state — owned by startShotWatch / stopShotWatch.
let shotWatchId: number | null = null;
let shotWatchTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

export function startGpsTracking(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      console.warn("[gps] geolocation not available");
      resolve();
      return;
    }
    if (active) {
      console.log("[gps] already active");
      resolve();
      return;
    }

    active = true;
    lastPosition = null;

    autoStopTimer = setTimeout(() => {
      console.warn("[gps] auto-stop after 6h");
      try {
        localStorage.setItem(AUTO_STOPPED_FLAG, new Date().toISOString());
      } catch {
        // ignore storage failures
      }
      stopGpsTracking();
    }, MAX_TRACKING_DURATION_MS);

    beforeUnloadHandler = () => stopGpsTracking();
    window.addEventListener("beforeunload", beforeUnloadHandler);

    try {
      localStorage.setItem(
        UNFINISHED_ROUND_FLAG,
        JSON.stringify({ startedAt: new Date().toISOString() })
      );
    } catch {
      // ignore storage failures
    }

    console.log("[gps] single-shot mode active");
    resolve();
  });
}

export function stopGpsTracking(): void {
  if (typeof window === "undefined") return;

  // Defensive: if a shot watch is still running (round ended mid-measurement,
  // 6-hour auto-stop, etc.), tear it down before clearing module state.
  stopShotWatch();

  active = false;
  lastPosition = null;

  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }

  if (beforeUnloadHandler) {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadHandler = null;
  }

  try {
    localStorage.removeItem(UNFINISHED_ROUND_FLAG);
  } catch {
    // ignore storage failures
  }

  console.log("[gps] stopped");
}

export function getLatestPosition(): GpsPoint | null {
  return lastPosition;
}

export interface BestShotPosition {
  lat: number;
  lng: number;
  accuracy: number;
  source: "single-shot";
  sampleCount: 1;
}

export function getBestShotPosition(): Promise<BestShotPosition | null> {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    console.error("[gps] geolocation unavailable");
    return Promise.resolve(null);
  }
  console.log("[gps] single-shot getCurrentPosition", SHARED_OPTIONS);
  return new Promise<BestShotPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp ?? Date.now(),
        };
        lastPosition = point;
        console.log("[gps] single-shot OK", {
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
        });
        resolve({
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
          source: "single-shot",
          sampleCount: 1,
        });
      },
      (err) => {
        console.error("[gps] single-shot ERR", {
          code: err.code,
          codeMeaning:
            err.code === 1 ? "PERMISSION_DENIED"
            : err.code === 2 ? "POSITION_UNAVAILABLE"
            : err.code === 3 ? "TIMEOUT"
            : "UNKNOWN",
          message: err.message,
          options: SHARED_OPTIONS,
        });
        resolve(null);
      },
      SHARED_OPTIONS,
    );
  });
}

export function isGpsActive(): boolean {
  return active;
}

// ── Pair-scoped watchPosition for the live distance meter ──────────────
//
// startShotWatch() opens navigator.geolocation.watchPosition for the duration
// of one 打つ前→止まった場所 pair. The callback fires whenever the OS
// produces a fresh fix (typically every 1–3s at high accuracy outdoors).
// Each fix updates `lastPosition` so GpsIndicator stays fresh, and is forwarded
// to the supplied onUpdate handler so the UI can recompute the live
// straight-line distance from the start point.
//
// Why straight-line (Haversine) distance, not cumulative path length:
// ゴルファーが知りたい数字は「自分のショットがどれだけ飛んだか」のみ。
// カート移動距離は経路依存で意味のない数字になる（池を避ける遠回り・ボール
// 探しの徘徊・同伴者対応で大きく変動）。プロのアナウンス「ナイスショット
// 250Y！」も常に直線距離。リアルタイム飛距離測定が本アプリの差別化ポイント。

export interface ShotWatchHandlers {
  onUpdate: (p: GpsPoint) => void;
  onTimeout: () => void;
  onError?: (err: GeolocationPositionError) => void;
}

export function startShotWatch(handlers: ShotWatchHandlers): boolean {
  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    console.warn("[gps] watchPosition unavailable");
    return false;
  }
  // Re-entrancy guard: if a previous pair never closed cleanly, drop it.
  if (shotWatchId !== null) {
    console.log("[gps] shot watch already active — restarting");
    stopShotWatch();
  }

  const timeoutMs = resolveShotTimeoutMs();
  console.log(`[gps] startShotWatch (timeout=${timeoutMs}ms)`);

  shotWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const point: GpsPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp ?? Date.now(),
      };
      lastPosition = point;
      console.log(
        `[gps] watch lat=${point.lat.toFixed(6)} lng=${point.lng.toFixed(6)} acc=${Math.round(point.accuracy)}m`,
      );
      handlers.onUpdate(point);
    },
    (err) => {
      console.error("[gps] watchPosition ERR", {
        code: err.code,
        codeMeaning:
          err.code === 1 ? "PERMISSION_DENIED"
          : err.code === 2 ? "POSITION_UNAVAILABLE"
          : err.code === 3 ? "TIMEOUT"
          : "UNKNOWN",
        message: err.message,
      });
      handlers.onError?.(err);
    },
    SHARED_OPTIONS,
  );

  // 15分タイマー：押し忘れ検知＋電池保護。発火時は watch をクリアしてから
  // onTimeout を呼ぶ（呼び出し側で UI リセット＋トースト表示）。
  shotWatchTimeoutTimer = setTimeout(() => {
    console.warn(`[gps] shot watch auto-stopped after ${timeoutMs}ms`);
    // Tear down the watch first, then notify. Capture handler before
    // stopShotWatch nulls our local refs (the handler ref is the caller's).
    const onTimeout = handlers.onTimeout;
    stopShotWatch();
    onTimeout();
  }, timeoutMs);

  return true;
}

export function stopShotWatch(): void {
  if (typeof window === "undefined") return;
  if (shotWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(shotWatchId);
    console.log("[gps] stopShotWatch — clearWatch called");
  }
  shotWatchId = null;
  if (shotWatchTimeoutTimer) {
    clearTimeout(shotWatchTimeoutTimer);
    shotWatchTimeoutTimer = null;
  }
}

export function getShotWatchTimeoutMs(): number {
  return resolveShotTimeoutMs();
}

export function hasUnfinishedRound(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(UNFINISHED_ROUND_FLAG);
  } catch {
    return false;
  }
}

export function getUnfinishedRoundInfo(): { startedAt: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(UNFINISHED_ROUND_FLAG);
    if (!raw) return null;
    return JSON.parse(raw) as { startedAt: string };
  } catch {
    return null;
  }
}
