// ── Club types ──────────────────────────────────────────────────────

export type Club =
  | "1w" | "3w" | "5w" | "7w" | "9w"
  | "u2" | "u3" | "u4" | "u5" | "u6" | "u7"
  | "2i" | "3i" | "4i" | "5i" | "6i" | "7i" | "8i" | "9i"
  | "pw" | "aw" | "gw" | "sw" | "lw";

export const CLUBS: Club[] = [
  "1w", "3w", "5w", "7w", "9w",
  "u2", "u3", "u4", "u5", "u6", "u7",
  "2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i",
  "pw", "aw", "gw", "sw", "lw",
];

export const CLUB_LABELS: Record<Club, string> = {
  "1w": "1W",  "3w": "3W",  "5w": "5W",  "7w": "7W",  "9w": "9W",
  "u2": "U2",  "u3": "U3",  "u4": "U4",  "u5": "U5",  "u6": "U6",  "u7": "U7",
  "2i": "2I",  "3i": "3I",  "4i": "4I",  "5i": "5I",  "6i": "6I",
  "7i": "7I",  "8i": "8I",  "9i": "9I",
  "pw": "PW",  "aw": "AW",  "gw": "GW",  "sw": "SW",  "lw": "LW",
};

// ── Lie types ──────────────────────────────────────────────────────

export type LieType = "tee" | "fw" | "rough" | "ob" | "bunker" | "trees" | "green" | "other";

export const LIE_TYPES: LieType[] = ["tee", "fw", "rough", "ob", "bunker", "trees", "green", "other"];

export const LIE_LABELS: Record<LieType, string> = {
  tee:    "ティー",
  fw:     "FW",
  rough:  "ラフ",
  ob:     "OB",
  bunker: "バンカー",
  trees:  "林",
  green:  "グリーン",
  other:  "その他",
};

export const LIE_SHORT: Record<LieType, string> = {
  tee:    "T",
  fw:     "FW",
  rough:  "RF",
  ob:     "OB",
  bunker: "BK",
  trees:  "林",
  green:  "GR",
  other:  "他",
};

// ── GPS ────────────────────────────────────────────────────────────

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// ── Database row types ─────────────────────────────────────────────

export interface Profile {
  id: string;
  display_name: string | null;
  handicap: number | null;
  created_at: string;
}

export interface Round {
  id: string;
  user_id: string;
  course_name: string;
  date: string;
  total_score: number | null;
  notes: string | null;
  created_at: string;
}

export interface Hole {
  id: string;
  round_id: string;
  hole_number: number;
  par: number;
  score: number | null;
  putts: number | null;
  distance_yards: number | null;
}

export interface Shot {
  id: string;
  hole_id: string;
  round_id: string;
  shot_number: number;
  club: Club;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  distance_meters: number | null;
  distance_yards: number | null;
  lie_type: LieType | null;
  notes: string | null;
  created_at: string;
}

export interface ClubAverage {
  id: string;
  user_id: string;
  club: Club;
  average_distance_meters: number;
  shot_count: number;
  updated_at: string;
}

// ── Joined types ───────────────────────────────────────────────────

export interface HoleWithShots extends Hole {
  shots: Shot[];
}

// ── AI advice types ─────────────────────────────────────────────────

export interface ClubAdviceRequest {
  distanceToPin: number;
  windSpeed?: number;
  windDirection?: string;
  elevation?: number;
  conditions?: string;
}

export interface ClubAdviceResponse {
  recommendedClub: Club;
  alternativeClub?: Club;
  reasoning: string;
  tips: string[];
}
