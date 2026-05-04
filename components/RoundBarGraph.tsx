"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

interface RoundData {
  id: string;
  course_name: string;
  date: string;
  total_score: number | null;
  total_putts: number | null;
}

export function RoundBarGraph({ data }: { data: RoundData[] }) {
  const chartData = [...data]
    .filter((r) => r.total_score != null)
    .reverse()
    .map((r) => ({
      name: new Date(r.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      score: r.total_score as number,
      putts: r.total_putts,
    }));

  if (chartData.length === 0) return null;

  const hasPutts = chartData.some((d) => d.putts != null);

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold text-green-800">直近10ラウンド成績グラフ</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: hasPutts ? 12 : 4, left: -20, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#86efac" }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            yAxisId="score"
            orientation="left"
            tick={{ fontSize: 10, fill: "#16a34a" }}
            domain={["auto", "auto"]}
          />
          {hasPutts && (
            <YAxis
              yAxisId="putts"
              orientation="right"
              tick={{ fontSize: 10, fill: "#60a5fa" }}
              domain={["auto", "auto"]}
            />
          )}
          <Tooltip
            formatter={(value, name) => [
              `${value}打`,
              name === "score" ? "スコア" : "パット数",
            ]}
            labelStyle={{ color: "#166534", fontSize: 12 }}
            contentStyle={{ borderColor: "#86efac", borderRadius: "8px", fontSize: 12 }}
          />
          <Legend
            formatter={(value) => value === "score" ? "スコア" : "パット数"}
            wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          />
          <Bar
            yAxisId="score"
            dataKey="score"
            name="score"
            fill="#16a34a"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          {hasPutts && (
            <Bar
              yAxisId="putts"
              dataKey="putts"
              name="putts"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
