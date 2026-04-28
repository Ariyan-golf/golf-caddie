"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateDistance, metersToYards } from "@/lib/distance";

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

  function record() {
    setError(null);
    setState("locating");

    if (!navigator.geolocation) {
      setError("このデバイスはGPSに対応していません");
      setState("idle");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const supabase = createClient();

        // Retroactively set end position + distance of the previous shot
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

        // Insert new shot — club and lie filled in later
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
      },
      () => {
        setError("GPS取得失敗。位置情報の許可を確認してください。");
        setState("idle");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2">{error}</p>
      )}
      <button
        onClick={record}
        disabled={state === "locating"}
        className="w-full py-5 rounded-2xl font-bold text-xl transition-all
                   bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white shadow-md disabled:opacity-60 disabled:cursor-wait"
      >
        {state === "locating" ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            GPS取得中...
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1">
            <span>ショット記録　第{shotNumber}打</span>
            <span className="text-sm font-normal opacity-80">打つ前に押してね</span>
          </span>
        )}
      </button>
    </div>
  );
}
