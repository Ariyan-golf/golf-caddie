"use client";

import { useState, useEffect, useCallback } from "react";
import type { Location } from "@/types";
import { calculateDistance, metersToYards } from "@/lib/distance";

interface GpsTrackerProps {
  onDistanceRecorded: (distanceMeters: number, start: Location, end: Location) => void;
}

type TrackingState = "idle" | "tracking" | "done";

export function GpsTracker({ onDistanceRecorded }: GpsTrackerProps) {
  const [state, setState] = useState<TrackingState>("idle");
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);

  const stopTracking = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  }, [watchId]);

  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  function startShot() {
    setError(null);
    if (!navigator.geolocation) {
      setError("このデバイスはGPSに対応していません");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: Location = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setStartLocation(loc);
        setState("tracking");

        const id = navigator.geolocation.watchPosition(
          (current) => {
            const cur: Location = {
              latitude: current.coords.latitude,
              longitude: current.coords.longitude,
              accuracy: current.coords.accuracy,
            };
            setCurrentLocation(cur);
            setLiveDistance(calculateDistance(loc, cur));
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 2000 }
        );
        setWatchId(id);
      },
      () => setError("GPS位置情報の取得に失敗しました。位置情報の許可を確認してください。"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function recordShot() {
    if (!startLocation || !currentLocation) return;
    stopTracking();

    const dist = calculateDistance(startLocation, currentLocation);
    setState("done");
    onDistanceRecorded(dist, startLocation, currentLocation);
  }

  function reset() {
    stopTracking();
    setState("idle");
    setStartLocation(null);
    setCurrentLocation(null);
    setLiveDistance(null);
    setError(null);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-green-800">GPS 飛距離計測</h3>
        <span
          className={`badge ${
            state === "tracking"
              ? "bg-green-100 text-green-700"
              : state === "done"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {state === "idle" && "待機中"}
          {state === "tracking" && "● 計測中"}
          {state === "done" && "記録済み"}
        </span>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2">{error}</p>
      )}

      {state === "tracking" && liveDistance !== null && (
        <div className="text-center py-4">
          <p className="text-5xl font-bold text-green-700">{metersToYards(liveDistance)}</p>
          <p className="text-green-500 text-sm mt-1">ヤード（{Math.round(liveDistance)}m）</p>
          <p className="text-xs text-green-400 mt-2">
            精度: ±{Math.round(currentLocation?.accuracy ?? 0)}m
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {state === "idle" && (
          <button onClick={startShot} className="btn-primary">
            ショット開始
          </button>
        )}
        {state === "tracking" && (
          <>
            <button onClick={recordShot} className="btn-primary">
              着地点を記録
            </button>
            <button onClick={reset} className="btn-secondary" style={{ width: "auto", paddingLeft: "1rem", paddingRight: "1rem" }}>
              キャンセル
            </button>
          </>
        )}
        {state === "done" && (
          <button onClick={reset} className="btn-secondary">
            次のショット
          </button>
        )}
      </div>
    </div>
  );
}
