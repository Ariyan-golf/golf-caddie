"use client";

import { useEffect, useState } from "react";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";

const WIND_DIR_DEG: Record<string, number> = {
  "北": 0, "北東": 45, "東": 90, "南東": 135,
  "南": 180, "南西": 225, "西": 270, "北西": 315,
};

interface Props {
  windDirection: string | null;
  windSpeed: string | null;
  visible: boolean;
  onToggle: () => void;
  greenDirection: number | null;
  onSetGreenDirection: (deg: number) => void;
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
  windDirection, windSpeed, visible, onToggle,
  greenDirection, onSetGreenDirection,
}: Props) {
  const { heading, requestPermission, sensorState } = useDeviceOrientation();
  const [pendingSet, setPendingSet] = useState(false);

  // After tapping "Set" on iOS, permission resolves first; the first heading
  // event arrives a moment later. Once heading turns non-null, commit it.
  useEffect(() => {
    if (pendingSet && heading !== null) {
      onSetGreenDirection(heading);
      setPendingSet(false);
    }
  }, [pendingSet, heading, onSetGreenDirection]);

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
              className="flex-shrink-0 flex items-center justify-center text-[11px] text-sky-700 text-center leading-tight px-2 bg-white rounded-full border border-sky-100"
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

              {/* Wind arrow — rotates with (windDeg - heading) so it stays at its real-world bearing */}
              {windDeg !== null && (
                <g transform={`rotate(${windDeg - effectiveHeading} ${CX} ${CY})`}>
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
              <p className="text-sm font-bold text-sky-700">
                風 {windDirection ?? "—"}
              </p>
              <p className="text-xs text-sky-500">{windSpeed ?? "—"}</p>
            </div>
            {sensorBlocked ? (
              <p className="text-[11px] text-gray-500 leading-tight">
                グリーン方向は<br />未対応端末では使えません
              </p>
            ) : greenDirection === null ? (
              <button
                onClick={handleSetGreen}
                disabled={pendingSet}
                className="self-start text-xs font-semibold px-3 py-1.5 rounded-full
                           bg-green-600 hover:bg-green-700 active:bg-green-800 text-white
                           shadow-sm transition-colors active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pendingSet ? "🚩 方位取得中…" : "🚩 グリーン方向を設定"}
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-green-700">🚩 設定済み</span>
                <button
                  onClick={handleSetGreen}
                  disabled={pendingSet}
                  className="text-[11px] text-sky-700 underline disabled:opacity-50"
                >
                  {pendingSet ? "取得中…" : "再設定"}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-sky-500">🧭 コンパスOFF</div>
      )}

      <button
        onClick={onToggle}
        className={`absolute top-1.5 right-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
          visible
            ? "bg-sky-100 border-sky-300 text-sky-700"
            : "bg-gray-100 border-gray-200 text-gray-500"
        }`}
      >
        {visible ? "OFF" : "ON"}
      </button>
    </div>
  );
}
