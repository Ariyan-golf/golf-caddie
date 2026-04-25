"use client";

import { useState } from "react";
import { GpsTracker } from "./GpsTracker";
import type { Club, Location } from "@/types";
import { CLUB_LABELS } from "@/types";
import { metersToYards } from "@/lib/distance";
import { createClient } from "@/lib/supabase/client";

interface ShotRecorderProps {
  holeId: string;
  roundId: string;
  shotNumber: number;
  onShotRecorded: () => void;
}

type Phase = "select" | "tracking" | "saving";

const WOOD_CLUBS: Club[] = ["1w", "3w", "5w", "7w", "9w"];
const UTIL_CLUBS: Club[] = ["u2", "u3", "u4", "u5", "u6", "u7"];
const IRON_CLUBS: Club[] = ["2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i"];
const WEDGE_CLUBS: Club[] = ["pw", "aw", "gw", "sw", "lw"];

export function ShotRecorder({ holeId, roundId, shotNumber, onShotRecorded }: ShotRecorderProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [trackerKey, setTrackerKey] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);

  function tapClub(club: Club) {
    setSelectedClub(club);
    setLastResult(null);
    setPhase("tracking");
  }

  async function handleShotRecorded(distMeters: number, start: Location, end: Location) {
    if (!selectedClub) return;
    setPhase("saving");

    const supabase = createClient();
    const { error } = await supabase.from("shots").insert({
      hole_id: holeId,
      round_id: roundId,
      shot_number: shotNumber,
      club: selectedClub,
      start_lat: start.latitude,
      start_lng: start.longitude,
      end_lat: end.latitude,
      end_lng: end.longitude,
      distance_meters: distMeters,
      distance_yards: metersToYards(distMeters),
    });

    if (!error) {
      setLastResult(`${CLUB_LABELS[selectedClub]}  ${metersToYards(distMeters)}y`);
      onShotRecorded();
    }
    setSelectedClub(null);
    setTrackerKey((k) => k + 1);
    setPhase("select");
  }

  function cancelTracking() {
    setSelectedClub(null);
    setTrackerKey((k) => k + 1);
    setPhase("select");
  }

  return (
    <div className="space-y-3">
      {/* Last result flash */}
      {lastResult && phase === "select" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center">
          <p className="text-sm font-bold text-green-700">✓ {lastResult}</p>
        </div>
      )}

      {/* GPS tracking panel */}
      {phase === "tracking" && selectedClub && (
        <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4">
          <p className="text-center text-sm font-bold text-green-800 mb-3">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1" />
            {CLUB_LABELS[selectedClub]} — GPS計測中
          </p>
          <GpsTracker
            key={trackerKey}
            onShotRecorded={handleShotRecorded}
            onCancel={cancelTracking}
          />
        </div>
      )}

      {phase === "saving" && (
        <div className="text-center py-4">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-green-600 mt-2">保存中...</p>
        </div>
      )}

      {/* Club grid */}
      {phase === "select" && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-green-600 text-center">
            第{shotNumber}打 — 番手をタップ → GPS自動記録
          </p>

          {/* Woods */}
          <div className="grid grid-cols-5 gap-1.5">
            {WOOD_CLUBS.map((c) => <ClubBtn key={c} club={c} onTap={tapClub} />)}
          </div>

          {/* Utilities */}
          <div className="grid grid-cols-6 gap-1.5">
            {UTIL_CLUBS.map((c) => <ClubBtn key={c} club={c} onTap={tapClub} />)}
          </div>

          {/* Irons */}
          <div className="grid grid-cols-4 gap-1.5">
            {IRON_CLUBS.map((c) => <ClubBtn key={c} club={c} onTap={tapClub} />)}
          </div>

          {/* Wedges */}
          <div className="grid grid-cols-5 gap-1.5">
            {WEDGE_CLUBS.map((c) => <ClubBtn key={c} club={c} onTap={tapClub} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ClubBtn({ club, onTap }: { club: Club; onTap: (c: Club) => void }) {
  return (
    <button
      onClick={() => onTap(club)}
      className="py-3 rounded-xl bg-white border border-green-200 text-green-800
                 text-sm font-bold hover:bg-green-100 active:scale-95 transition-all
                 shadow-sm"
    >
      {CLUB_LABELS[club]}
    </button>
  );
}
