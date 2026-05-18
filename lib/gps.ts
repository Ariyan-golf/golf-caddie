"use client";

// Single-shot GPS module.
// Previous design used continuous watchPosition which kept the GPS chip alive
// for the entire round, draining ~50% battery in 9 holes (5/16 大隅CC).
// Now every GPS read is a one-shot getCurrentPosition triggered by a user
// action (打つ前 / 止まった場所 / グリーンセンター / 残り距離 / 天気自動取得).
// The buffer/Kalman/HDOP infrastructure is removed — a single fresh fix is
// already filtered by enableHighAccuracy + the OS's own Kalman smoothing.

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

let active = false;
let lastPosition: GpsPoint | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let beforeUnloadHandler: (() => void) | null = null;

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
