import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `あなたはR&A・JGA公認の2024年版ゴルフ規則に精通したプロゴルフキャディです。
プレイヤーからのルール質問に対して、以下のルールに基づいて正確・簡潔に日本語で回答してください。

準拠規則: R&A/JGA ゴルフ規則2024年版（Rules of Golf 2024）

回答は必ず以下のJSON形式のみで返してください（余分なテキスト不要）:
{
  "summary": "一行で結論を述べる（例：OBは1打罰で元の場所から再プレー）",
  "rule_ref": "該当規則番号（例：規則18.2）。複数あればカンマ区切り",
  "key_points": [
    {"type": "ok", "text": "できること・正しい処置"},
    {"type": "ng", "text": "できないこと・禁止事項"},
    {"type": "info", "text": "ペナルティや補足情報"}
  ],
  "steps": ["手順がある場合は順番に記述", "手順2"],
  "penalty": "ペナルティの説明（ない場合はnull）"
}

key_pointsのtypeは "ok"（緑・推奨）/ "ng"（赤・禁止）/ "info"（灰・情報）の3種類のみ使用。
stepsは手順が不要な質問の場合は空配列[]にしてください。
必ず実際のゴルフ規則に基づいて回答し、不確かな情報は含めないでください。`;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profile?.plan !== "premium") {
    return NextResponse.json({ error: "premium_required" }, { status: 403 });
  }

  const { question } = await request.json();
  if (!question?.trim()) {
    return NextResponse.json({ error: "質問を入力してください" }, { status: 400 });
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
  }

  try {
    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "AI応答の解析に失敗しました" }, { status: 500 });
  }
}
