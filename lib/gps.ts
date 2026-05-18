"use client";

// Continuous GPS tracking module (Day 1 of GPS improvement plan).
// Day 2 adds HDOP threshold & outlier removal in getRecentPositions(),
// plus a getBestShotPosition() helper that applies a Kalman filter.
// Singleton — only one watchPosition runs at a time.

import { KalmanFilter2D } from "./kalmanFilter";

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

const BUFFER_CAPACITY = 50;
const ACCURACY_THRESHOLD_M = 20;
const MAX_TRACKING_DURATION_MS = 6 * 60 * 60 * 1000;

// Day 2 filtering: stricter accuracy cap for shot-time selection, and a
// physical-impossibility speed ceiling. Golf cart top speed ≈ 25 km/h ≈ 7 m/s,
// running ≈ 5 m/s; 15 m/s rejects only true GPS jitter jumps.
const SHOT_ACCURACY_MAX_M = 30;
const MAX_PLAUSIBLE_SPEED_MPS = 15;

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
        console.error("[gps] watchPosition ERR", {
          code: err.code,
          codeMeaning:
            err.code === 1 ? "PERMISSION_DENIED"
            : err.code === 2 ? "POSITION_UNAVAILABLE"
            : err.code === 3 ? "TIMEOUT"
            : "UNKNOWN",
          message: err.message,
          options: { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 },
        });
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

function haversineMeters(a: GpsPoint, b: GpsPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getRecentPositions(seconds: number): GpsPoint[] {
  const cutoff = Date.now() - seconds * 1000;
  const recent = buffer.filter((p) => p.timestamp >= cutoff);

  const filtered: GpsPoint[] = [];
  for (const p of recent) {
    if (p.accuracy > SHOT_ACCURACY_MAX_M) {
      console.warn(
        `[gps] outlier rejected (accuracy ${Math.round(p.accuracy)}m > ${SHOT_ACCURACY_MAX_M}m)`,
      );
      continue;
    }
    const prev = filtered[filtered.length - 1];
    if (prev) {
      const dtSec = Math.max(0.001, (p.timestamp - prev.timestamp) / 1000);
      const dist = haversineMeters(prev, p);
      const speed = dist / dtSec;
      if (speed > MAX_PLAUSIBLE_SPEED_MPS) {
        console.warn(
          `[gps] outlier rejected (speed ${speed.toFixed(1)}m/s > ${MAX_PLAUSIBLE_SPEED_MPS}m/s, jump ${dist.toFixed(1)}m in ${dtSec.toFixed(2)}s)`,
        );
        continue;
      }
    }
    filtered.push(p);
  }
  return filtered;
}

export interface BestShotPosition {
  lat: number;
  lng: number;
  accuracy: number;
  source: "history+kalman" | "fallback-getCurrentPosition";
  sampleCount: number;
}

// Pick the most reliable single position for shot recording.
// Strategy: take the last 5s of filtered history, run it through a 2D Kalman
// filter (which already weights low-accuracy points down via accuracy²), and
// return the smoothed final point. If no history is available (GPS just
// started, buffer empty), fall back to a one-shot getCurrentPosition.
export async function getBestShotPosition(): Promise<BestShotPosition | null> {
  const recent = getRecentPositions(5);

  if (recent.length > 0) {
    const kalman = new KalmanFilter2D();
    let smoothed = { lat: recent[0].lat, lng: recent[0].lng };
    let bestAccuracy = Infinity;
    for (const p of recent) {
      smoothed = kalman.filter(p.lat, p.lng, p.accuracy, p.timestamp);
      if (p.accuracy < bestAccuracy) bestAccuracy = p.accuracy;
    }
    console.log(
      `[gps] best shot pos (history+kalman): lat=${smoothed.lat.toFixed(6)} lng=${smoothed.lng.toFixed(6)} ` +
        `samples=${recent.length} bestAcc=${Math.round(bestAccuracy)}m ` +
        `raw=[${recent[recent.length - 1].lat.toFixed(6)}, ${recent[recent.length - 1].lng.toFixed(6)}]`,
    );
    return {
      lat: smoothed.lat,
      lng: smoothed.lng,
      accuracy: bestAccuracy,
      source: "history+kalman",
      sampleCount: recent.length,
    };
  }

  if (typeof window === "undefined" || !("geolocation" in navigator)) {
    console.error("[gps] fallback unavailable — no navigator.geolocation");
    return null;
  }
  console.log("[gps] no history — falling back to getCurrentPosition");
  const options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
  return new Promise<BestShotPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("[gps] fallback getCurrentPosition OK", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: "fallback-getCurrentPosition",
          sampleCount: 1,
        });
      },
      (err) => {
        console.error("[gps] fallback getCurrentPosition ERR", {
          code: err.code,
          codeMeaning:
            err.code === 1 ? "PERMISSION_DENIED"
            : err.code === 2 ? "POSITION_UNAVAILABLE"
            : err.code === 3 ? "TIMEOUT"
            : "UNKNOWN",
          message: err.message,
          options,
        });
        resolve(null);
      },
      options,
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
