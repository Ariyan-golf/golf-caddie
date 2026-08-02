import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/day-pass";
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
提供された画像のゴルフの状況を分析し、日本語で回答してください。

重要な原則:
静止画から断定できることは限られています。断定を避け、条件付きで説明してください。
判断が動作の連続性に依存する場合（押したのか打ったのか、打つ前に触れたのか等）は、
「〜であれば適法、〜であれば2罰打」という形で両方を示してください。
画像から読み取れないことは、ユーザー自身が確認すべき点として checkpoints に入れてください。

ユーザーから質問がある場合の最優先事項:
summary には必ず「ユーザーが尋ねた事柄」に対する結論を書いてください。
画像を見て気づいた別の論点があっても、それを summary に書いてはいけません。
別の論点は key_points または checkpoints に入れ、結論を置き換えないようにしてください。
例えば「このスタンスは問題ないか」と聞かれた場合、summary はスタンスの適否についての結論であり、
砂への接触など他の懸念は key_points 側に記載します。
結論は断定を避けつつも、最も可能性の高い判断を先に一文で示し、その後に条件を補足する形にしてください。
例:「両足がプレーの線をまたいでおらず、クラブを体に固定していなければ規則上問題ありません」

以下のJSON形式のみで返してください（余分なテキスト不要）:
{
  "situation": "画像から読み取れる状況の説明（1〜2文）",
  "summary": "考えられる規則と判断の分かれ目を一行で",
  "rule_ref": "関係する規則番号。複数あればカンマ区切り",
  "key_points": [
    {"type": "ok", "text": "適法となる条件・できること"},
    {"type": "ng", "text": "違反となる条件・できないこと"},
    {"type": "info", "text": "補足情報"}
  ],
  "checkpoints": ["画像では判断できず、本人が確認すべき点1", "点2"],
  "steps": ["手順がある場合の手順1", "手順2"],
  "penalty": "違反に該当した場合の罰の説明（該当しうる違反がない場合はnull）"
}

key_pointsのtypeは "ok" / "ng" / "info" のみ使用。
steps、checkpoints は不要な場合は空配列 [] にしてください。
必ず実際のゴルフ規則に基づいて回答し、不確かな情報は含めないでください。`;

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
    .select("plan, day_pass_date")
    .eq("id", user.id)
    .single();

  if (!hasFullAccess(profile ?? {})) {
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

  const { imageBase64, mediaType = "image/jpeg", question = "" } = await request.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "画像が必要です" }, { status: 400 });
  }

  const safeType: ImageMediaType = VALID_TYPES.includes(mediaType as ImageMediaType)
    ? (mediaType as ImageMediaType)
    : "image/jpeg";

  const trimmedQuestion = typeof question === "string" ? question.trim() : "";
  const userText = trimmedQuestion
    ? `ユーザーからの質問: ${trimmedQuestion}\n\nこの質問に答える形で、画像の状況に適用されるゴルフ規則を説明してください。`
    : "この画像の状況にどのゴルフ規則が適用されますか？正しい処置を教えてください。";

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
          text: userText,
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
