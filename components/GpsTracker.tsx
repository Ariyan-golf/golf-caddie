"use client";

import { useState, useEffect, useRef } from "react";
import type { Location } from "@/types";
import { calculateDistance, metersToYards } from "@/lib/distance";

interface GpsTrackerProps {
  onShotRecorded: (distMeters: number, start: Location, end: Location) => void;
  onCancel: () => void;
  // 計測確定ボタンの文言（既定は本体アプリ向け）。/try では「②ボール地点で計測」を渡す。
  recordLabel?: string;
}

export function GpsTracker({
  onShotRecorded,
  onCancel,
  recordLabel = "着地点を記録",
}: GpsTrackerProps) {
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [liveDistance, setLiveDistance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const startRef = useRef<Location | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("このデバイスはGPSに対応していません");
      setLocating(false);
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
        startRef.current = loc;
        setLocating(false);

        const id = navigator.geolocation.watchPosition(
          (curr) => {
            const cur: Location = {
              latitude: curr.coords.latitude,
              longitude: curr.coords.longitude,
              accuracy: curr.coords.accuracy,
            };
            setCurrentLocation(cur);
            if (startRef.current) {
              setLiveDistance(calculateDistance(startRef.current, cur));
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 2000 }
        );
        watchIdRef.current = id;
      },
      () => {
        setError("GPS取得失敗。位置情報の許可を確認してください。");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function recordLanding() {
    if (!startRef.current) return;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    const end = currentLocation ?? startRef.current;
    const dist = calculateDistance(startRef.current, end);
    onShotRecorded(dist, startRef.current, end);
  }

  if (locating) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-green-600">GPS取得中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2">{error}</p>

        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="text-xs text-green-600 underline"
        >
          {showHelp ? "設定方法を隠す ▲" : "設定方法を見る ▼"}
        </button>

        {showHelp && (
          <ol className="text-xs text-green-700 bg-green-50 rounded-lg p-3 space-y-2 list-decimal list-inside">
            <li>
              Safariのアドレスバー左の「ぁあ」→「Webサイトの設定」→ 位置情報を「許可」にする
            </li>
            <li>
              それでも失敗する場合：iPhoneの「設定」→「プライバシーとセキュリティ」→「位置情報サービス」→「Safariのウェブサイト」→「このアプリの使用中」を選択
            </li>
            <li>設定後、このページを再読み込みして再試行してください</li>
          </ol>
        )}

        <button onClick={onCancel} className="btn-secondary py-2 text-sm">キャンセル</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center py-1">
        {liveDistance !== null ? (
          <>
            <p className="text-5xl font-bold text-green-700 tabular-nums">
              {metersToYards(liveDistance)}
            </p>
            <p className="text-green-500 text-sm">y（{Math.round(liveDistance)}m）</p>
          </>
        ) : (
          <p className="text-green-400 text-sm">歩いてください…</p>
        )}
        <p className="text-xs text-green-400 mt-1">
          精度 ±{Math.round(currentLocation?.accuracy ?? startLocation?.accuracy ?? 0)}m
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={recordLanding} className="btn-primary">
          {recordLabel}
        </button>
        <button
          onClick={onCancel}
          className="flex-shrink-0 bg-white border border-green-300 text-green-700
                     font-semibold py-3 px-4 rounded-xl transition-colors hover:bg-green-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}
