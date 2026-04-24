import { anthropic, GOLF_SYSTEM_PROMPT } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface SwingAnalysisRequest {
  description: string;
  club?: string;
  shotResult?: string;
  issues?: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: SwingAnalysisRequest = await request.json();

  const prompt = `ゴルファーのスイングを分析してください。

${body.club ? `使用番手: ${body.club}` : ""}
${body.shotResult ? `ショット結果: ${body.shotResult}` : ""}
${body.issues?.length ? `課題・悩み: ${body.issues.join("、")}` : ""}
スイングの説明: ${body.description}

以下のJSON形式で詳しく分析してください:
{
  "analysis": "スイング全体の分析（3〜4文）",
  "strengths": ["良い点1", "良い点2"],
  "issues": ["問題点1", "問題点2"],
  "tips": [
    {"title": "改善ポイント1", "detail": "具体的な練習方法"},
    {"title": "改善ポイント2", "detail": "具体的な練習方法"},
    {"title": "改善ポイント3", "detail": "具体的な練習方法"}
  ],
  "priority": "最優先で取り組むべき改善点（1文）"
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: GOLF_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
  }

  const analysis = JSON.parse(jsonMatch[0]);

  // Save to DB
  await supabase.from("swing_analyses").insert({
    user_id: user.id,
    analysis_result: analysis.analysis,
    tips: analysis.tips,
  });

  return NextResponse.json(analysis);
}
