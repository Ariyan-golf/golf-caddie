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

const CLUBS: Club[] = [
  "driver", "3wood", "5wood",
  "5iron", "6iron", "7iron", "8iron", "9iron",
  "pw", "aw", "sw", "putter",
];

export function ShotRecorder({ holeId, roundId, shotNumber, onShotRecorded }: ShotRecorderProps) {
  const [selectedClub, setSelectedClub] = useState<Club>("7iron");
  const [saving, setSaving] = useState(false);
  const [savedDist, setSavedDist] = useState<number | null>(null);

  async function handleDistanceRecorded(
    distanceMeters: number,
    start: Location,
    end: Location
  ) {
    setSaving(true);
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
      distance_meters: distanceMeters,
      distance_yards: metersToYards(distanceMeters),
    });

    setSaving(false);

    if (!error) {
      setSavedDist(distanceMeters);
      onShotRecorded();
    }
  }

  return (
    <div className="space-y-4">
      {/* Club selector */}
      <div className="card">
        <p className="label">番手を選択（第{shotNumber}打）</p>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {CLUBS.map((club) => (
            <button
              key={club}
              onClick={() => setSelectedClub(club)}
              className={`py-2 px-1 rounded-xl text-sm font-medium transition-colors ${
                selectedClub === club
                  ? "bg-green-600 text-white"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}
            >
              {CLUB_LABELS[club]}
            </button>
          ))}
        </div>
      </div>

      <GpsTracker onDistanceRecorded={handleDistanceRecorded} />

      {saving && (
        <p className="text-center text-sm text-green-600">保存中...</p>
      )}

      {savedDist !== null && (
        <div className="card bg-green-50 border-green-200 text-center">
          <p className="font-semibold text-green-700">
            {CLUB_LABELS[selectedClub]} で {metersToYards(savedDist)}y を記録しました
          </p>
        </div>
      )}
    </div>
  );
}
