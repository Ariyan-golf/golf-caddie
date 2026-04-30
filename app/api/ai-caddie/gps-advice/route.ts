import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type CharacterId = "mika" | "yoshi" | "sage" | "taka";

const CHARACTER_PROMPTS: Record<CharacterId, string> = {
  mika: `あなたはミカちゃんというゴルフキャディです。元気で明るく、初心者のゴルファーを優しく応援する女の子です。
「〜だよ！」「〜ね！」「〜しようよ！」「頑張れ！」「大丈夫！」などの言葉を使います。
専門用語はできるだけ使わず、わかりやすい言葉で話します。
プレイヤーに向かって話しかけるように、残り距離に合ったクラブ選択とコースの攻め方を3〜5文で教えてください。
文末に絵文字を1〜2個つけてもOKです。`,

  yoshi: `あなたはヨシさんというベテランゴルフキャディです。20年以上の経験を持ち、的確で無駄のない言葉で状況を判断します。
「〜ですね」「〜でしょう」「〜がよいかと思います」「〜をお勧めします」という落ち着いた言葉で話します。
残り距離に合ったクラブ選択とコースの攻め方を3〜5文で的確に教えてください。
感情的な表現は避け、プロフェッショナルに話してください。`,

  sage: `あなたはゴルフ仙人という名の達人ゴルフキャディです。長年の修行で得た深い洞察を持ち、独特の比喩と哲学的な言い回しを使います。
「〜じゃ」「〜ものじゃ」「〜であろう」「ほっほっほ」という古風な表現と、水・山・風・竹などの自然の比喩を織り交ぜます。
残り距離に合ったクラブ選択とコースの攻め方を、哲学的かつ独特の言い回しで3〜5文で教えてください。`,

  taka: `あなたはタカさんというプロゴルファー出身のコーチキャディです。コースマネジメントを最重視し、リスクとリターンを常に計算します。
「コースマネジメントとしては〜」「戦略的に〜」「リスクを考えると〜」「プロなら〜」という言葉を使います。
残り距離に合った戦略的なコース攻略法とクラブ選択を、論理的かつ明確に3〜5文で教えてください。`,
};

function todayJSTBounds() {
  const nowMs = Date.now();
  const jstMs = nowMs + 9 * 60 * 60 * 1000;
  const todayStr = new Date(jstMs).toISOString().slice(0, 10);
  const nextStr = new Date(jstMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { gte: `${todayStr}T00:00:00+09:00`, lt: `${nextStr}T00:00:00+09:00` };
}

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

  const body = await request.json();
  const { character, distanceMeters, distanceYards } = body;

  if (!character || !CHARACTER_PROMPTS[character as CharacterId]) {
    return NextResponse.json({ error: "キャラクターを選択してください" }, { status: 400 });
  }

  const systemPrompt = CHARACTER_PROMPTS[character as CharacterId];
  const userMsg =
    distanceMeters != null && distanceYards != null
      ? `プレイヤーの現在地からピンまで約${distanceYards}ヤード（${Math.round(distanceMeters)}メートル）です。アドバイスをお願いします。`
      : `残り距離が不明の状況です。一般的なコースマネジメントのアドバイスをお願いします。`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ advice: text });
}
