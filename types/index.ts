export type Club =
  | "driver"
  | "3wood"
  | "5wood"
  | "3iron"
  | "4iron"
  | "5iron"
  | "6iron"
  | "7iron"
  | "8iron"
  | "9iron"
  | "pw"
  | "aw"
  | "sw"
  | "lw"
  | "putter";

export const CLUB_LABELS: Record<Club, string> = {
  driver: "ドライバー",
  "3wood": "3W",
  "5wood": "5W",
  "3iron": "3I",
  "4iron": "4I",
  "5iron": "5I",
  "6iron": "6I",
  "7iron": "7I",
  "8iron": "8I",
  "9iron": "9I",
  pw: "PW",
  aw: "AW",
  sw: "SW",
  lw: "LW",
  putter: "パター",
};

export interface Location {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

// ── Database row types ──────────────────────────────────────────────

export interface Profile {
  id: string;
  display_name: string | null;
  handicap: number | null;
  is_beta_user: boolean;
  beta_expires_at: string;
  created_at: string;
  updated_at: string | null;
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

export interface SwingAnalysis {
  id: string;
  user_id: string;
  shot_id: string | null;
  analysis_result: string;
  tips: string[];
  created_at: string;
}

// ── Joined / enriched types ─────────────────────────────────────────

export interface RoundWithHoles extends Round {
  holes: Hole[];
}

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
  userClubAverages?: Partial<Record<Club, number>>;
}

export interface ClubAdviceResponse {
  recommendedClub: Club;
  alternativeClub?: Club;
  reasoning: string;
  tips: string[];
}

export interface UserClubStats {
  club: Club;
  average_distance: number;
  shot_count: number;
}

// ── Beta user helpers ───────────────────────────────────────────────

export function isBetaValid(profile: Pick<Profile, "is_beta_user" | "beta_expires_at">): boolean {
  return profile.is_beta_user && new Date(profile.beta_expires_at) > new Date();
}

export function betaDaysRemaining(profile: Pick<Profile, "beta_expires_at">): number {
  const diff = new Date(profile.beta_expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
