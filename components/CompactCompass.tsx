"use client";

import { useEffect, useState } from "react";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { calculateDistance, metersToYards } from "@/lib/distance";
import { awaitHighAccuracyFix } from "@/lib/gps";

const WIND_DIR_DEG: Record<string, number> = {
  "北": 0, "北東": 45, "東": 90, "南東": 135,
  "南": 180, "南西": 225, "西": 270, "北西": 315,
};

// Symbol pointing to where the wind is blowing TO (not where it comes from).
// e.g. 北 (wind from north) → ↓ (blows south).
const WIND_TO_ARROW: Record<string, string> = {
  "北": "↓", "北東": "↙", "東": "←", "南東": "↖",
  "南": "↑", "南西": "↗", "西": "→", "北西": "↘",
};

interface Props {
  windDirection: string | null;
  windSpeed: string | null;
  visible: boolean;
  greenDirection: number | null;
  onSetGreenDirection: (deg: number) => void;
  greenCenter?: { lat: number; lng: number } | null;
}

const SIZE = 120;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 12;

function polar(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

function shortestDelta(a: number, b: number): number {
  const d = ((a - b) % 360 + 360) % 360;
  return Math.min(d, 360 - d);
}

export function CompactCompass({
  windDirection, windSpeed, visible,
  greenDirection, onSetGreenDirection,
  greenCenter = null,
}: Props) {
  const { heading, requestPermission, sensorState } = useDeviceOrientation();
  const [pendingSet, setPendingSet] = useState(false);

  // Remaining-distance readout: ephemeral, auto-clears after 5s. Whatever
  // is shown here (distance / error / retry / null) lives entirely in this state.
  const [remaining, setRemaining] = useState<
    { kind: "distance"; yards: number; meters: number }
    | { kind: "message"; text: string }
    | { kind: "needs_retry" }
    | null
  >(null);
  const [remainingLoading, setRemainingLoading] = useState(false);
  const [accuracyHint, setAccuracyHint] = useState<number | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");

  // After tapping "Set" on iOS, permission resolves first; the first heading
  // event arrives a moment later. Once heading turns non-null, commit it.
  useEffect(() => {
    if (pendingSet && heading !== null) {
      onSetGreenDirection(heading);
      setPendingSet(false);
    }
  }, [pendingSet, heading, onSetGreenDirection]);

  // Clear remaining-distance state whenever the current hole's green center
  // changes (HoleRecorder swaps the prop on hole switch).
  useEffect(() => {
    setRemaining(null);
  }, [greenCenter]);

  // Auto-dismiss the remaining-distance readout after 5 seconds.
  // 5s gives the player enough time to glance, address the ball, and re-check
  // before swinging. Tapping again resets the timer (dependency on `remaining`
  // re-runs the effect, the cleanup clears the prior timeout).
  useEffect(() => {
    if (!remaining) return;
    const t = setTimeout(() => setRemaining(null), 5000);
    return () => clearTimeout(t);
  }, [remaining]);

  async function handleShowRemaining() {
    if (remainingLoading) return;
    if (!greenCenter) {
      setRemaining({ kind: "message", text: "グリーン未登録です" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setRemaining({ kind: "message", text: "位置情報を取得できませんでした" });
      return;
    }
    setManualMode(false);
    setRemainingLoading(true);
    setAccuracyHint(null);
    setRemaining(null);

    const fix = await awaitHighAccuracyFix({
      onProgress: (p) => setAccuracyHint(p.accuracy),
    });
    setRemainingLoading(false);
    setAccuracyHint(null);

    if (!fix) {
      setRemaining({ kind: "needs_retry" });
      return;
    }
    const distM = calculateDistance(
      { latitude: fix.lat, longitude: fix.lng },
      { latitude: greenCenter.lat, longitude: greenCenter.lng },
    );
    setRemaining({
      kind: "distance",
      yards: metersToYards(distM),
      meters: Math.round(distM * 10) / 10,
    });
  }

  function startManualInput() {
    setRemaining(null);
    setManualMode(true);
    setManualInput("");
  }

  function submitManualInput() {
    const yards = parseInt(manualInput, 10);
    if (!Number.isFinite(yards) || yards <= 0) return;
    setRemaining({
      kind: "distance",
      yards,
      meters: Math.round((yards / 1.09361) * 10) / 10,
    });
    setManualMode(false);
    setManualInput("");
  }

  async function handleSetGreen() {
    if (heading !== null) {
      onSetGreenDirection(heading);
      return;
    }
    setPendingSet(true);
    const granted = await requestPermission();
    if (!granted) setPendingSet(false);
  }

  const sensorBlocked = sensorState === "unsupported" || sensorState === "denied";
  const effectiveHeading = heading ?? 0;
  const windDeg = windDirection ? (WIND_DIR_DEG[windDirection] ?? null) : null;

  const angleDiff =
    greenDirection !== null && heading !== null ? shortestDelta(greenDirection, heading) : null;
  const isAligned = angleDiff !== null && angleDiff <= 15;

  const labels: Array<{ ch: string; angle: number; color: string }> = [
    { ch: "N", angle: 0, color: "#dc2626" },
    { ch: "E", angle: 90, color: "#475569" },
    { ch: "S", angle: 180, color: "#475569" },
    { ch: "W", angle: 270, color: "#475569" },
  ];

  return (
    <div className="relative px-3 py-2 bg-sky-50 rounded-xl border border-sky-100">
      {visible ? (
        <div className="flex items-center gap-3">
          {sensorBlocked ? (
            <div
              className="flex-shrink-0 flex items-center justify-center text-base text-sky-700 text-center leading-tight px-2 bg-white rounded-full border border-sky-100"
              style={{ width: SIZE, height: SIZE }}
            >
              方位センサー<br />未対応
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="flex-shrink-0"
              style={{ width: SIZE, height: SIZE }}
              aria-label="コンパス"
            >
              <circle cx={CX} cy={CY} r={R} fill="white" stroke="#7dd3fc" strokeWidth="1.5" />
              <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="#bae6fd" strokeWidth="0.5" strokeDasharray="2 2" />
              <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="#bae6fd" strokeWidth="0.5" strokeDasharray="2 2" />

              {/* Fixed "phone up" marker above the dial */}
              <polygon
                points={`${CX},${CY - R - 5} ${CX - 4},${CY - R + 2} ${CX + 4},${CY - R + 2}`}
                fill="#0ea5e9"
              />

              {/* Wind arrow — points to where the wind is blowing TO (windDeg + 180), then
                  counter-rotates by the device heading so it stays at its real-world bearing. */}
              {windDeg !== null && (
                <g transform={`rotate(${windDeg + 180 - effectiveHeading} ${CX} ${CY})`}>
                  <line x1={CX} y1={CY + 14} x2={CX} y2={CY - 16} stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
                  <polygon points={`${CX},${CY - 20} ${CX - 3.5},${CY - 14} ${CX + 3.5},${CY - 14}`} fill="#0284c7" />
                  <line x1={CX - 3} y1={CY + 14} x2={CX} y2={CY + 9} stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={CX + 3} y1={CY + 14} x2={CX} y2={CY + 9} stroke="#0284c7" strokeWidth="1.5" strokeLinecap="round" />
                </g>
              )}

              {/* N/S/E/W — positioned in screen-space so they stay upright */}
              {labels.map(({ ch, angle, color }) => {
                const pos = polar(angle - effectiveHeading, R - 10);
                return (
                  <text
                    key={ch}
                    x={pos.x}
                    y={pos.y + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill={color}
                  >
                    {ch}
                  </text>
                );
              })}

              {/* Green direction flag — at its absolute bearing, drawn upright */}
              {greenDirection !== null && (() => {
                const pos = polar(greenDirection - effectiveHeading, R - 14);
                const size = isAligned ? 24 : 16;
                return (
                  <>
                    {isAligned && (
                      <circle cx={pos.x} cy={pos.y - 5} r={14} fill="#22c55e" fillOpacity={0.25} />
                    )}
                    <text
                      x={pos.x}
                      y={pos.y + size / 4}
                      textAnchor="middle"
                      fontSize={size}
                      style={{
                        filter: isAligned ? "hue-rotate(120deg) saturate(1.8)" : undefined,
                      }}
                      className={isAligned ? "animate-pulse" : undefined}
                    >
                      🚩
                    </text>
                  </>
                );
              })()}

              <circle cx={CX} cy={CY} r={1.8} fill="#0284c7" />
            </svg>
          )}

          {/* Right column: wind text + green-direction control */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 py-1">
            <div className="leading-tight">
              <p className="text-lg font-bold text-sky-700">
                風 {windDirection ? (WIND_TO_ARROW[windDirection] ?? "—") : "—"}
              </p>
              <p className="text-base text-sky-500">{windSpeed ?? "—"}</p>
            </div>
            <div className="flex gap-2 items-stretch">
              {sensorBlocked ? (
                <div className="flex-1 min-h-[64px] flex items-center justify-center
                                px-2 py-2 rounded-full bg-gray-50 border border-gray-200
                                text-gray-500 text-sm text-center leading-tight">
                  方位センサー<br />未対応
                </div>
              ) : (
                <button
                  onClick={handleSetGreen}
                  disabled={pendingSet}
                  className={`flex-1 min-h-[64px] flex items-center justify-center
                              text-base font-bold text-center leading-tight
                              px-2 py-2 rounded-full transition-colors active:scale-95
                              disabled:opacity-60 disabled:cursor-not-allowed ${
                    greenDirection === null
                      ? "bg-green-600 hover:bg-green-700 active:bg-green-800 text-white shadow-sm"
                      : "bg-green-50 hover:bg-green-100 active:bg-green-200 text-green-700 border border-green-300"
                  }`}
                >
                  {pendingSet
                    ? "🚩 取得中"
                    : greenDirection === null
                      ? "🚩 グリーン方向"
                      : "🚩 設定済み"}
                </button>
              )}
              <button
                onClick={handleShowRemaining}
                disabled={remainingLoading}
                className="flex-1 min-h-[64px] flex items-center justify-center
                           text-base font-bold text-center leading-tight
                           px-2 py-2 rounded-full
                           bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300
                           text-emerald-800 border border-emerald-200
                           transition-colors active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {remainingLoading ? "📡 取得中" : "📍 残り距離"}
              </button>
            </div>
            {greenDirection !== null && !sensorBlocked && (
              <button
                onClick={handleSetGreen}
                disabled={pendingSet}
                className="text-xs text-sky-700 underline py-0.5 disabled:opacity-50 self-start"
              >
                {pendingSet ? "取得中…" : "再設定"}
              </button>
            )}
            {remainingLoading && (
              <p className="text-sm text-emerald-700 tabular-nums leading-tight">
                {accuracyHint != null
                  ? `📡 測位中… ±${Math.round(accuracyHint)}m`
                  : "📡 測位中…"}
              </p>
            )}
            {!remainingLoading && remaining?.kind === "distance" && (
              <p className="text-xl text-emerald-800 font-bold tabular-nums leading-tight">
                残り {remaining.yards}ヤード（{remaining.meters}m）
              </p>
            )}
            {!remainingLoading && remaining?.kind === "message" && (
              <p className="text-xl text-emerald-800 font-bold tabular-nums leading-tight">
                {remaining.text}
              </p>
            )}
            {!remainingLoading && remaining?.kind === "needs_retry" && (
              <div className="flex flex-col gap-1.5 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <p className="text-xs text-amber-700 leading-tight">
                  数歩動いてからもう一度お試しください
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleShowRemaining}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-amber-500 hover:bg-amber-600 text-white"
                  >
                    📍 もう一度試す
                  </button>
                  <button
                    onClick={startManualInput}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-md bg-white border border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    ✏️ 手動入力
                  </button>
                </div>
              </div>
            )}
            {!remainingLoading && manualMode && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="ヤード"
                  className="w-20 text-sm px-2 py-1.5 rounded-md border border-emerald-300 bg-white text-emerald-800 tabular-nums"
                />
                <button
                  onClick={submitManualInput}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  決定
                </button>
                <button
                  onClick={() => { setManualMode(false); setManualInput(""); }}
                  className="px-2 py-1.5 text-xs text-emerald-600 hover:text-emerald-800"
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-base text-sky-500">🧭 コンパスOFF</div>
      )}
    </div>
  );
}
