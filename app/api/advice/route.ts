import { anthropic, GOLF_SYSTEM_PROMPT } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { ClubAdviceRequest } from "@/types";
import { CLUB_LABELS } from "@/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: ClubAdviceRequest = await request.json();

  // Fetch user's club averages for personalization
  const { data: clubAverages } = await supabase
    .from("club_averages")
    .select("club, average_distance_meters, shot_count")
    .eq("user_id", user.id);

  const userStatsText = clubAverages?.length
    ? `\n\nこのユーザーの実績データ:\n` +
      clubAverages
        .map(
          (r) =>
            `- ${CLUB_LABELS[r.club as keyof typeof CLUB_LABELS] ?? r.club}: 平均${Math.round(r.average_distance_meters * 1.09361)}y（${r.shot_count}打実績）`
        )
        .join("\n")
    : "";

  const prompt = `以下の状況で最適な番手をアドバイスしてください。

ピンまでの距離: ${body.distanceToPin}ヤード
${body.windSpeed ? `風速: ${body.windSpeed}m/s` : ""}
${body.windDirection ? `風向: ${body.windDirection}` : ""}
${body.elevation !== undefined ? `高低差: ${body.elevation > 0 ? "+" : ""}${body.elevation}m（打ち上げ/打ち下ろし）` : ""}
${body.conditions ? `コース状況: ${body.conditions}` : ""}
${userStatsText}

以下のJSON形式で回答してください:
{
  "recommendedClub": "番手のキー（例: 7iron）",
  "alternativeClub": "代替番手のキー",
  "reasoning": "選択理由（2〜3文）",
  "tips": ["アドバイス1", "アドバイス2", "アドバイス3"]
}

番手キーは driver, 3wood, 5wood, 3iron, 4iron, 5iron, 6iron, 7iron, 8iron, 9iron, pw, aw, sw, lw, putter のいずれかを使用してください。`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    system: GOLF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
  }

  const advice = JSON.parse(jsonMatch[0]);
  return NextResponse.json(advice);
}
