import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function todayJSTBounds() {
  const nowMs = Date.now();
  const jstMs = nowMs + 9 * 60 * 60 * 1000;
  const todayStr = new Date(jstMs).toISOString().slice(0, 10);
  const nextStr = new Date(jstMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { gte: `${todayStr}T00:00:00+09:00`, lt: `${nextStr}T00:00:00+09:00` };
}

const RULE_VISION_PROMPT = `あなたはR&A・JGA公認の2023年版JGAゴルフ規則に精通したプロゴルフキャディです。
提供された画像のゴルフの状況を分析し、適用されるゴルフ規則と正しい処置を日本語で回答してください。

以下のJSON形式のみで返してください（余分なテキスト不要）:
{
  "situation": "画像の状況の説明（1〜2文）",
  "summary": "裁定の結論を一行で",
  "rule_ref": "該当規則番号（例：規則18.2）。複数あればカンマ区切り",
  "key_points": [
    {"type": "ok", "text": "正しい処置・できること"},
    {"type": "ng", "text": "禁止事項・できないこと"},
    {"type": "info", "text": "ペナルティや補足情報"}
  ],
  "steps": ["手順がある場合の手順1", "手順2"],
  "penalty": "ペナルティの説明（ない場合はnull）"
}

key_pointsのtypeは "ok" / "ng" / "info" のみ使用。stepsは手順不要な場合は空配列 [] にしてください。`;

const VALID_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageMediaType = typeof VALID_TYPES[number];

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
    const { gte, lt } = todayJSTBounds();
    const { data: todayPayment } = await admin
      .from("round_payments")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", gte)
      .lt("created_at", lt)
      .limit(1)
      .maybeSingle();
    if (!todayPayment) {
      return NextResponse.json({ error: "premium_required" }, { status: 403 });
    }
  }

  const { imageBase64, mediaType = "image/jpeg" } = await request.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "画像が必要です" }, { status: 400 });
  }

  const safeType: ImageMediaType = VALID_TYPES.includes(mediaType as ImageMediaType)
    ? (mediaType as ImageMediaType)
    : "image/jpeg";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: RULE_VISION_PROMPT,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: safeType, data: imageBase64 },
        },
        {
          type: "text",
          text: "この画像の状況にどのゴルフ規則が適用されますか？正しい処置を教えてください。",
        },
      ],
    }],
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
