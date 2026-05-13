"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateDistance, metersToYards } from "@/lib/distance";
import { getBestShotPosition } from "@/lib/gps";

interface PrevShot {
  id: string;
  start_lat: number;
  start_lng: number;
}

interface ShotRecorderProps {
  holeId: string;
  roundId: string;
  shotNumber: number;
  prevShot: PrevShot | null;
  onShotRecorded: () => void;
}

type State = "idle" | "locating";

export function ShotRecorder({
  holeId, roundId, shotNumber, prevShot, onShotRecorded,
}: ShotRecorderProps) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setError(null);
    setState("locating");

    const best = await getBestShotPosition();
    if (!best) {
      setError("GPS取得失敗。位置情報の許可を確認してください。");
      setState("idle");
      return;
    }

    const lat = best.lat;
    const lng = best.lng;
    const supabase = createClient();

    if (prevShot) {
      const distM = calculateDistance(
        { latitude: prevShot.start_lat, longitude: prevShot.start_lng },
        { latitude: lat, longitude: lng },
      );
      await supabase
        .from("shots")
        .update({
          end_lat: lat,
          end_lng: lng,
          distance_meters: distM,
          distance_yards: metersToYards(distM),
        })
        .eq("id", prevShot.id);
    }

    const { error: err } = await supabase.from("shots").insert({
      hole_id: holeId,
      round_id: roundId,
      shot_number: shotNumber,
      start_lat: lat,
      start_lng: lng,
    });

    if (err) {
      setError("保存に失敗しました");
      setState("idle");
      return;
    }

    setState("idle");
    onShotRecorded();
  }

  const isLocating = state === "locating";

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2">{error}</p>
      )}
      <button
        onClick={record}
        disabled={isLocating}
        className={`w-full py-5 rounded-2xl font-bold text-xl transition-all
                    ${isLocating
                      ? "bg-white text-green-400 border-2 border-green-200 opacity-70 cursor-wait"
                      : "bg-green-500 hover:bg-green-600 active:bg-green-700 text-white shadow-lg"}`}
      >
        {isLocating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-green-300 border-t-transparent rounded-full animate-spin" />
            GPS取得中...
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1">
            <span>第{shotNumber}打　打つ前に押してね</span>
            <span className="text-sm font-normal opacity-90">（ショット記録です）</span>
          </span>
        )}
      </button>
    </div>
  );
}
