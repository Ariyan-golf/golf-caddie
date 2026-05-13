"use client";

// 2D position Kalman filter for GPS smoothing (Day 2 of GPS improvement plan).
// Scalar position filter (no velocity model) applied independently per axis
// with isotropic variance. Variance is tracked in m² and the gain (unitless)
// is applied to lat/lng deltas in degrees — same approach as Andoyd's
// well-known GpsKalmanFilter and most lightweight on-device GPS smoothers.
//
// Tuning rationale for smartphone GPS during golf rounds:
//   processNoise = 0.5 m²/sec
//     A golfer either stands still or walks ~1.5 m/sec between shots. Over a
//     1 sec sample interval, 0.5 m² (= σ ≈ 0.7 m) lets the filter follow real
//     motion without lagging on legitimate position changes.
//   measurementNoise = accuracy² (when useAccuracy = true)
//     Phone GPS reports a 68% confidence radius via `accuracy` (meters).
//     Squaring gives variance, and using it dynamically means low-accuracy
//     points are downweighted automatically without manual threshold tuning.
//   measurementNoise default = 100 m² (= σ = 10 m)
//     Reasonable mid-range smartphone GPS noise when `accuracy` is missing.

export interface KalmanFilter2DOptions {
  processNoise?: number;
  measurementNoise?: number;
  useAccuracy?: boolean;
}

export class KalmanFilter2D {
  private lat: number | null = null;
  private lng: number | null = null;
  private variance = -1;
  private lastTimestamp = 0;

  private readonly processNoise: number;
  private readonly defaultMeasurementNoise: number;
  private readonly useAccuracy: boolean;

  constructor(opts: KalmanFilter2DOptions = {}) {
    this.processNoise = opts.processNoise ?? 0.5;
    this.defaultMeasurementNoise = opts.measurementNoise ?? 100;
    this.useAccuracy = opts.useAccuracy ?? true;
  }

  filter(
    lat: number,
    lng: number,
    accuracy: number,
    timestamp: number,
  ): { lat: number; lng: number } {
    const r = this.useAccuracy
      ? Math.max(1, accuracy * accuracy)
      : this.defaultMeasurementNoise;

    if (this.variance < 0) {
      this.lat = lat;
      this.lng = lng;
      this.variance = r;
      this.lastTimestamp = timestamp;
      return { lat, lng };
    }

    const dtSec = Math.max(0.001, (timestamp - this.lastTimestamp) / 1000);
    this.variance += dtSec * this.processNoise;

    const gain = this.variance / (this.variance + r);
    this.lat = this.lat! + gain * (lat - this.lat!);
    this.lng = this.lng! + gain * (lng - this.lng!);
    this.variance *= 1 - gain;
    this.lastTimestamp = timestamp;

    return { lat: this.lat, lng: this.lng };
  }

  reset(): void {
    this.lat = null;
    this.lng = null;
    this.variance = -1;
    this.lastTimestamp = 0;
  }
}
