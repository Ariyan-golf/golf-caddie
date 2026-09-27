"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
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
  // 直近20ラウンドを「1ラウンド=1オブジェクト」で、古い順（左）→新しい順（右）。
  // latestLabel は最新（右端）の1件だけに値を持たせ、数値ラベルをそこにだけ出す。
  const rows = [...data]
    .filter((r) => r.total_score != null)
    .slice(0, 20)
    .reverse();
  const chartData = rows.map((r, i) => ({
    date: new Date(r.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
    score: r.total_score as number,
    latestLabel: i === rows.length - 1 ? (r.total_score as number) : null,
  }));

  if (chartData.length === 0) return null;

  // 縦軸は表示データから算出（最低-5 を10刻みで切り下げ〜最高+5 を10刻みで切り上げ）。
  const scores = chartData.map((d) => d.score);
  const yMin = Math.floor((Math.min(...scores) - 5) / 10) * 10;
  const yMax = Math.ceil((Math.max(...scores) + 5) / 10) * 10;
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += 10) yTicks.push(v);

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold text-green-800">直近ラウンドの推移</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#166534" }}
            interval="preserveStartEnd"
            minTickGap={16}
            height={36}
          />
          <YAxis
            orientation="left"
            tick={{ fontSize: 10, fill: COLOR_SCORE }}
            domain={[yMin, yMax]}
            ticks={yTicks}
            allowDecimals={false}
            width={36}
          />
          {/* スマホでタップ後に残る灰色の帯を出さないよう cursor は細い縦線。
              吹き出しは上端に固定し、線や点を隠さないようにする。 */}
          <Tooltip
            cursor={{ stroke: "#86efac", strokeWidth: 1 }}
            position={{ y: 0 }}
            formatter={(value) => [`${value}打`, "スコア"]}
            labelStyle={{ color: "#166534", fontSize: 12 }}
            contentStyle={{ borderColor: "#86efac", borderRadius: "8px", fontSize: 12 }}
          />
          <Line
            type="linear"
            dataKey="score"
            name="score"
            stroke={COLOR_SCORE}
            strokeWidth={2}
            dot={{ r: 3, fill: COLOR_SCORE, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey="latestLabel"
              position="top"
              style={{ fill: "#166534", fontSize: 11, fontWeight: 600 }}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
