"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts";

interface RoundData {
  id: string;
  course_name: string;
  date: string;
  total_score: number | null;
}

const COLOR_SCORE = "#16a34a"; // 緑

export function RoundBarGraph({ data }: { data: RoundData[] }) {
  // 直近3ラウンドを「1ラウンド=1オブジェクト」で、古い順（左）→新しい順（右）。
  const chartData = [...data]
    .filter((r) => r.total_score != null)
    .slice(0, 3)
    .reverse()
    .map((r) => ({
      date: new Date(r.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      score: r.total_score as number,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold text-green-800">直近ラウンドの推移</h2>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "#166534" }}
            interval={0}
            height={36}
          />
          <YAxis
            orientation="left"
            tick={{ fontSize: 10, fill: COLOR_SCORE }}
            domain={[60, 120]}
            width={36}
          />
          <Tooltip
            formatter={(value) => [`${value}打`, "スコア"]}
            labelStyle={{ color: "#166534", fontSize: 12 }}
            contentStyle={{ borderColor: "#86efac", borderRadius: "8px", fontSize: 12 }}
          />
          <Bar
            dataKey="score"
            name="score"
            fill={COLOR_SCORE}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          >
            <LabelList
              dataKey="score"
              position="top"
              style={{ fill: "#166534", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
