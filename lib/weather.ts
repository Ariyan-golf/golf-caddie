import type { Weather, WindSpeed, WindDirection } from "@/types";

export interface WeatherData {
  weather: Weather;
  windSpeed: WindSpeed;
  windDirection: WindDirection;
  windSpeedMs: number;   // m/s（表示用）
  windDegrees: number;   // 気象学的角度 0=北, 90=東, 180=南, 270=西
  temperature: number;   // °C
}

// WMO Weather Interpretation Codes → 日本語天気
function weatherCodeToLabel(code: number): Weather {
  if (code === 0)        return "晴れ";   // Clear sky
  if (code <= 3)         return "曇り";   // Partly/mostly cloudy
  if (code <= 48)        return "曇り";   // Fog
  if (code <= 67)        return "小雨";   // Drizzle & light-moderate rain
  return "雨";                            // Heavy rain / snow / thunderstorm
}

// m/s → 風速ラベル（ゴルフ目安）
function windSpeedToLabel(ms: number): WindSpeed {
  if (ms < 3)  return "無風";
  if (ms < 7)  return "微風";
  if (ms < 11) return "普通";
  return "強風";
}

// 角度 → 8方位
function degreesToDirection(deg: number): WindDirection {
  const dirs: WindDirection[] = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

/**
 * Open-Meteo からリアルタイム気象データを取得する（APIキー不要・無料）
 * 失敗時は null を返す
 */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const json = await res.json();
    const cur  = json?.current;
    if (!cur) return null;

    // Open-Meteo のデフォルト単位: wind_speed_10m = km/h
    const kmh  = cur.wind_speed_10m     as number;
    const deg  = cur.wind_direction_10m as number;
    const code = cur.weather_code       as number;
    const temp = cur.temperature_2m     as number;
    const ms   = kmh / 3.6;

    return {
      weather:       weatherCodeToLabel(code),
      windSpeed:     windSpeedToLabel(ms),
      windDirection: degreesToDirection(deg),
      windSpeedMs:   Math.round(ms * 10) / 10,
      windDegrees:   deg,
      temperature:   Math.round(temp),
    };
  } catch {
    return null;
  }
}

/**
 * 風向き角度（気象学的）から表示矢印の回転角度を返す
 * ↑ を基準として「風が吹いていく方向」を示す
 * 北風(0°) → 南へ吹く → ↓(180°回転)
 */
export function windArrowRotation(windDeg: number): number {
  return (windDeg + 180) % 360;
}
