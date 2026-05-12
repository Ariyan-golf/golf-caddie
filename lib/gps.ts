"use client";

// Continuous GPS tracking module (Day 1 of GPS improvement plan).
// Singleton — only one watchPosition runs at a time.

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

const BUFFER_CAPACITY = 50;
const ACCURACY_THRESHOLD_M = 20;
const MAX_TRACKING_DURATION_MS = 6 * 60 * 60 * 1000;

const UNFINISHED_ROUND_FLAG = "golf_caddie_round_in_progress";
const AUTO_STOPPED_FLAG = "golf_caddie_gps_auto_stopped";

let watchId: number | null = null;
let buffer: GpsPoint[] = [];
let active = false;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let beforeUnloadHandler: (() => void) | null = null;

function pushPoint(p: GpsPoint): void {
  buffer.push(p);
  if (buffer.length > BUFFER_CAPACITY) {
    buffer.shift();
  }
}

export function startGpsTracking(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      console.warn("[gps] geolocation not available");
      resolve();
      return;
    }
    if (active) {
      console.log("[gps] already tracking");
      resolve();
      return;
    }

    active = true;
    buffer = [];

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const point: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp ?? Date.now(),
        };
        if (point.accuracy <= ACCURACY_THRESHOLD_M) {
          pushPoint(point);
        }
        console.log(
          `[gps] watch lat=${point.lat.toFixed(6)} lng=${point.lng.toFixed(6)} acc=${Math.round(point.accuracy)}m ${
            point.accuracy <= ACCURACY_THRESHOLD_M ? "(accepted)" : "(rejected: low accuracy)"
          }`
        );
      },
      (err) => {
        console.warn("[gps] watchPosition error:", err.message);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
    );

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

    resolve();
  });
}

export function stopGpsTracking(): void {
  if (typeof window === "undefined") return;

  if (watchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
  active = false;

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
  if (buffer.length === 0) return null;
  return buffer[buffer.length - 1];
}

export function getRecentPositions(seconds: number): GpsPoint[] {
  const cutoff = Date.now() - seconds * 1000;
  return buffer.filter((p) => p.timestamp >= cutoff);
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
