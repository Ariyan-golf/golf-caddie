"use client";

import { useEffect, useState } from "react";
import { getLatestPosition, isGpsActive } from "@/lib/gps";

type Strength = "good" | "ok" | "weak" | "off";

function classify(): { level: Strength; accuracy: number | null } {
  if (!isGpsActive()) return { level: "off", accuracy: null };
  const p = getLatestPosition();
  if (!p) return { level: "off", accuracy: null };
  if (p.accuracy <= 10) return { level: "good", accuracy: p.accuracy };
  if (p.accuracy <= 20) return { level: "ok", accuracy: p.accuracy };
  return { level: "weak", accuracy: p.accuracy };
}

const LABEL: Record<Strength, { icon: string; text: string; cls: string }> = {
  good: { icon: "🟢", text: "GPS良好",  cls: "text-green-700"  },
  ok:   { icon: "🟡", text: "GPS普通",  cls: "text-amber-700"  },
  weak: { icon: "🔴", text: "GPS弱い",  cls: "text-red-600"    },
  off:  { icon: "⚪", text: "GPS無効",  cls: "text-gray-400"   },
};

export function GpsIndicator() {
  const [state, setState] = useState<{ level: Strength; accuracy: number | null }>(() => classify());

  useEffect(() => {
    const id = setInterval(() => setState(classify()), 1000);
    return () => clearInterval(id);
  }, []);

  const { icon, text, cls } = LABEL[state.level];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${cls} px-1`}>
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
      {state.accuracy != null && (
        <span className="text-gray-400 tabular-nums">
          ±{Math.round(state.accuracy)}m
        </span>
      )}
    </div>
  );
}
