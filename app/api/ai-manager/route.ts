import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/day-pass";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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
    return NextResponse.json({ error: "premium_required" }, { status: 403 });
  }

  const { courseName } = await request.json();
  if (!courseName?.trim()) {
    return NextResponse.json({ error: "ゴルフ場名を入力してください" }, { status: 400 });
  }

  const prompt = `「${courseName}」というゴルフ場について情報を教えてください。
実在するゴルフ場であれば実際の情報を、不明な場合は日本の一般的なゴルフ場として回答してください。

以下のJSON形式のみで回答してください（説明文不要）:
{
  "course_name": "ゴルフ場の正式名称",
  "overview": "コースの概要・特徴（2〜3文）",
  "course_features": ["特徴1", "特徴2", "特徴3", "特徴4", "特徴5"],
  "dress_code": [
    {"ok": true, "text": "ゴルフウェア（ポロシャツ・スラックス等）"},
    {"ok": true, "text": "ゴルフシューズ着用"},
    {"ok": false, "text": "デニム・ジーンズ"},
    {"ok": false, "text": "ノースリーブ・タンクトップ"},
    {"ok": false, "text": "サンダル・ビーチサンダル"}
  ],
  "manners": [
    {"ok": true, "text": "プレー前にスターターへ挨拶"},
    {"ok": true, "text": "前の組との間隔を適切に保つ"},
    {"ok": false, "text": "素振りでの他プレイヤーへの危険行為"},
    {"ok": false, "text": "グリーン上でのスパイク跡を直さない行為"}
  ],
  "notes": ["注意点1", "注意点2", "注意点3"]
}

dress_codeは5〜8項目、mannersは5〜7項目、notesは3〜5項目にしてください。`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: "あなたは日本のゴルフ場に詳しいゴルフコンシェルジュです。正確で実用的な情報を日本語で提供します。",
    messages: [{ role: "user", content: prompt }],
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
