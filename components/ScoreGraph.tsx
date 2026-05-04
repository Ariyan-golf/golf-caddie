"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from "recharts";

interface Round {
  id: string;
  course_name: string;
  date: string;
  total_score: number | null;
}

export function ScoreGraph({ rounds }: { rounds: Round[] }) {
  const data = [...rounds]
    .filter((r) => r.total_score != null)
    .reverse()
    .map((r) => ({
      name: new Date(r.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      score: r.total_score as number,
      course: r.course_name,
    }));

  if (data.length < 2) return null;

  const scores = data.map((d) => d.score);
  const yMin = Math.min(...scores, 72) - 4;
  const yMax = Math.max(...scores, 72) + 4;

  return (
    <div className="mt-4 pt-4 border-t border-green-50">
      <p className="text-xs text-green-500 mb-3 font-medium">
        スコア推移（直近 {data.length} ラウンド）
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 16, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#86efac" }} />
          <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: "#86efac" }} />
          <Tooltip
            formatter={(value: number) => [`${value}打`, "スコア"]}
            labelStyle={{ color: "#166534", fontSize: 12 }}
            contentStyle={{ borderColor: "#86efac", borderRadius: "8px", fontSize: 12 }}
          />
          <ReferenceLine
            y={72}
            stroke="#16a34a"
            strokeDasharray="5 3"
            label={{ value: "Par72", position: "insideTopRight", fontSize: 10, fill: "#16a34a" }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#16a34a"
            strokeWidth={2.5}
            dot={{ fill: "#16a34a", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#15803d" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
