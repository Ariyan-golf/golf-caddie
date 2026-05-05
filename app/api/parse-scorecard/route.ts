import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic } from "@/lib/anthropic";

const PARSE_PROMPT = `このゴルフスコアカードの画像を解析してください。

以下のJSON形式のみで返してください（説明・コードブロック不要）:
{
  "teeNames": ["ティー名1", "ティー名2", "ティー名3", "ティー名4"],
  "holes": [
    {
      "hole_number": 1,
      "par": 4,
      "hdcp": 7,
      "distances": [400, 370, 330, 280]
    }
  ]
}

ルール:
- teeNamesはスコアカード上のティーグランド名（例: BACK, BLUE, WHITE, RED, バック, レギュラー, レディース等）を左の列から順に最大4つ
- distancesはteeNamesの並び順に対応するヤード数の整数。列がない・読み取れない場合はnull
- 18ホール分のデータをhole_number昇順で返す（9ホール制なら見えているホールのみ）
- hdcpはHdcp/HCP/ハンデ列の整数値。ない場合はnull
- parは整数（3/4/5のいずれか）
- 数値は必ず整数で返す`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "画像ファイルを送信してください" }, { status: 400 });
  }

  const file = formData.get("image") as File | null;
  if (!file) return NextResponse.json({ error: "image フィールドが必要です" }, { status: 400 });

  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "JPEG/PNG/GIF/WebP のみ対応しています" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mediaType = file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: PARSE_PROMPT },
        ],
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract JSON from response (strip any surrounding text)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "スコアカードを解析できませんでした" }, { status: 422 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "解析結果のJSONが無効です" }, { status: 422 });
  }

  return NextResponse.json(parsed);
}
