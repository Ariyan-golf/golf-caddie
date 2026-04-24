"use client";

import { useState } from "react";
import type { ClubAdviceResponse, Club } from "@/types";
import { CLUB_LABELS } from "@/types";

export default function AdvicePage() {
  const [distance, setDistance] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [windDirection, setWindDirection] = useState("");
  const [elevation, setElevation] = useState("");
  const [conditions, setConditions] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClubAdviceResponse | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distanceToPin: parseInt(distance),
          windSpeed: windSpeed ? parseFloat(windSpeed) : undefined,
          windDirection: windDirection || undefined,
          elevation: elevation ? parseInt(elevation) : undefined,
          conditions: conditions || undefined,
        }),
      });

      if (!res.ok) throw new Error("APIエラー");
      const data = await res.json();
      setResult(data);
    } catch {
      setError("アドバイスの取得に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">🎯 番手アドバイス</h1>
        <p className="text-sm text-green-600 mt-1">状況を入力するとAIが最適な番手を提案します</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">ピンまでの距離 (ヤード) *</label>
          <input
            type="number"
            className="input"
            placeholder="例: 150"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            required
            min={1}
            max={400}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">風速 (m/s)</label>
            <input
              type="number"
              className="input"
              placeholder="例: 5"
              value={windSpeed}
              onChange={(e) => setWindSpeed(e.target.value)}
              min={0}
              max={30}
            />
          </div>
          <div>
            <label className="label">風向き</label>
            <select
              className="input"
              value={windDirection}
              onChange={(e) => setWindDirection(e.target.value)}
            >
              <option value="">なし</option>
              <option value="向かい風">向かい風</option>
              <option value="追い風">追い風</option>
              <option value="左からの横風">左横風</option>
              <option value="右からの横風">右横風</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">高低差 (m、打ち上げ+、打ち下ろし-)</label>
          <input
            type="number"
            className="input"
            placeholder="例: +10 or -5"
            value={elevation}
            onChange={(e) => setElevation(e.target.value)}
          />
        </div>

        <div>
          <label className="label">コース状況</label>
          <select
            className="input"
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
          >
            <option value="">通常</option>
            <option value="フェアウェイ">フェアウェイ</option>
            <option value="ラフ">ラフ（深め）</option>
            <option value="傾斜地">傾斜地</option>
            <option value="バンカー">バンカー</option>
          </select>
        </div>

        <button type="submit" className="btn-primary" disabled={loading || !distance}>
          {loading ? "AIが分析中..." : "番手を提案してもらう"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="card space-y-4">
          <div className="text-center py-2">
            <p className="text-sm text-green-600 mb-1">おすすめの番手</p>
            <p className="text-4xl font-bold text-green-700">
              {CLUB_LABELS[result.recommendedClub as Club] ?? result.recommendedClub}
            </p>
            {result.alternativeClub && (
              <p className="text-sm text-green-500 mt-1">
                代替: {CLUB_LABELS[result.alternativeClub as Club] ?? result.alternativeClub}
              </p>
            )}
          </div>

          <div className="bg-green-50 rounded-xl p-3">
            <p className="text-sm font-medium text-green-700 mb-1">選択理由</p>
            <p className="text-sm text-green-800">{result.reasoning}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-green-700 mb-2">アドバイス</p>
            <ul className="space-y-2">
              {result.tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-sm text-green-800">
                  <span className="text-green-500 flex-shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
