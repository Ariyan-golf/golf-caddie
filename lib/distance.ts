import type { Location } from "@/types";

// Haversine formula — returns distance in meters
export function calculateDistance(from: Location, to: Location): number {
  const R = 6371000;
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δφ = ((to.latitude - from.latitude) * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function metersToYards(meters: number): number {
  return Math.round(meters * 1.09361);
}

export function yardsToMeters(yards: number): number {
  return Math.round(yards / 1.09361);
}

export function formatDistance(meters: number): string {
  const yards = metersToYards(meters);
  return `${yards}y (${Math.round(meters)}m)`;
}
