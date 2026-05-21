"use client";

import { useEffect, useState } from "react";
import { getLatestPosition, isGpsActive } from "@/lib/gps";

// 5/21 青島ラウンド 14番で「セカンドに移動中にGPS表示が消えた」と
// ユーザーが誤解した問題を受けて、表示を 5 状態に分解。
//   good/ok/weak : 鮮度内のGPS fixあり（既存ロジック維持）
//   untracked    : ラウンド未開始 or 一度もGPS fix未取得 → ⚪ GPS未取得
//   idle         : pair-scoped watch 停止中で前回 fix から 60s 経過 → 💤 GPS節電中
// 節電動作（lib/gps.ts の pair-scoped watch）は一切変更しない。表示文言のみ。

type State = "good" | "ok" | "weak" | "untracked" | "idle";

const FRESH_MS = 60_000;

interface Status {
  state: State;
  accuracy: number | null;
  ageMs: number | null;
}

function classify(): Status {
  if (!isGpsActive()) return { state: "untracked", accuracy: null, ageMs: null };
  const p = getLatestPosition();
  if (!p) return { state: "untracked", accuracy: null, ageMs: null };
  const ageMs = Date.now() - p.timestamp;
  if (ageMs > FRESH_MS) return { state: "idle", accuracy: p.accuracy, ageMs };
  if (p.accuracy <= 10) return { state: "good", accuracy: p.accuracy, ageMs };
  if (p.accuracy <= 20) return { state: "ok",   accuracy: p.accuracy, ageMs };
  return { state: "weak", accuracy: p.accuracy, ageMs };
}

function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}秒前`;
  return `${Math.floor(sec / 60)}分前`;
}

const ACTIVE_LABEL: Record<"good" | "ok" | "weak", { icon: string; text: string; cls: string }> = {
  good: { icon: "🟢", text: "GPS良好", cls: "text-green-700" },
  ok:   { icon: "🟡", text: "GPS普通", cls: "text-amber-700" },
  weak: { icon: "🔴", text: "GPS弱い", cls: "text-red-600"   },
};

export function GpsIndicator() {
  const [status, setStatus] = useState<Status>(() => classify());

  useEffect(() => {
    const id = setInterval(() => setStatus(classify()), 1000);
    return () => clearInterval(id);
  }, []);

  if (status.state === "untracked") {
    return (
      <div className="flex items-center gap-1.5 text-base font-medium text-gray-400 px-1">
        <span aria-hidden="true">⚪</span>
        <span>GPS未取得</span>
      </div>
    );
  }

  if (status.state === "idle") {
    const ageText = status.ageMs != null ? formatAge(status.ageMs) : "";
    const accText = status.accuracy != null ? `±${Math.round(status.accuracy)}m` : "";
    return (
      <div className="flex flex-col items-end leading-tight px-1">
        <div className="flex items-center gap-1.5 text-base font-medium text-sky-600">
          <span aria-hidden="true">💤</span>
          <span>GPS節電中</span>
          {ageText && (
            <span className="text-gray-400 tabular-nums text-sm font-normal">{ageText}</span>
          )}
          {accText && (
            <span className="text-gray-400 tabular-nums text-sm font-normal">{accText}</span>
          )}
        </div>
        <span className="text-[10px] text-gray-400">
          次の「打つ前」で再開
        </span>
      </div>
    );
  }

  const { icon, text, cls } = ACTIVE_LABEL[status.state];
  return (
    <div className={`flex items-center gap-1.5 text-base font-medium ${cls} px-1`}>
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
      {status.accuracy != null && (
        <span className="text-gray-400 tabular-nums">
          ±{Math.round(status.accuracy)}m
        </span>
      )}
    </div>
  );
}
