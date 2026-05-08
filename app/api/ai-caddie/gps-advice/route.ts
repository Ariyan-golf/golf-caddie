import { anthropic } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/day-pass";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type CharacterId = "mika" | "yoshi" | "sage" | "taka";

const CHARACTER_PROMPTS: Record<CharacterId, string> = {
  mika: `あなたはミカちゃんというゴルフキャディです。元気で明るく、初心者のゴルファーを優しく応援する女の子です。
「〜だよ！」「〜ね！」「頑張れ！」などの言葉を使います。専門用語は使いません。
残り距離とコース状況に合ったクラブ選択とコースの攻め方を【2文以内】で端的に教えてください。それ以上は書かないこと。`,

  yoshi: `あなたはヨシさんというベテランゴルフキャディです。20年以上の経験を持ち、的確で無駄のない言葉で判断します。
「〜ですね」「〜でしょう」「〜がよいかと思います」という落ち着いた言葉を使います。
残り距離とコース状況に合ったクラブ選択とコースの攻め方を【2文以内】で端的に教えてください。それ以上は書かないこと。`,

  sage: `あなたはゴルフ仙人という達人ゴルフキャディです。「〜じゃ」「〜ものじゃ」「〜であろう」という古風な表現と自然の比喩を使います。
残り距離とコース状況に合ったクラブ選択とコースの攻め方を【2文以内】で端的に教えてください。それ以上は書かないこと。`,

  taka: `あなたはタカさんというプロゴルファー出身のコーチキャディです。コースマネジメントを最重視します。
「戦略的に〜」「リスクを考えると〜」という言葉を使います。
残り距離とコース状況に合った戦略とクラブ選択を【2文以内】で端的に教えてください。それ以上は書かないこと。`,
};

const WIND_LABELS:     Record<string, string> = { calm:"無風", light:"微風", moderate:"普通の風", strong:"強風" };
const WIND_DIR_LABELS: Record<string, string> = { none:"なし", head:"向かい風", tail:"追い風", cross:"横風" };
const LIE_LABELS:      Record<string, string> = { fw:"フェアウェイ", rough:"ラフ", bunker:"バンカー", tee:"ティーグラウンド" };
const SLOPE_LABELS:    Record<string, string> = { flat:"平坦", uphill:"上り傾斜", downhill:"下り傾斜" };

function todayJSTBounds() {
  const nowMs = Date.now();
  const jstMs = nowMs + 9 * 60 * 60 * 1000;
  const todayStr = new Date(jstMs).toISOString().slice(0, 10);
  const nextStr  = new Date(jstMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
    .from("profiles").select("plan, day_pass_date").eq("id", user.id).single();

  if (!hasFullAccess(profile ?? {})) {
    const { gte, lt } = todayJSTBounds();
    const { data: todayPayment } = await admin
      .from("round_payments").select("id").eq("user_id", user.id)
      .gte("created_at", gte).lt("created_at", lt).limit(1).maybeSingle();
    if (!todayPayment) return NextResponse.json({ error: "premium_required" }, { status: 403 });
  }

  const body = await request.json();
  const { character, distanceMeters, distanceYards, wind, windDir, lie, slope } = body;

  if (!character || !CHARACTER_PROMPTS[character as CharacterId]) {
    return NextResponse.json({ error: "キャラクターを選択してください" }, { status: 400 });
  }

  const distPart = distanceMeters != null && distanceYards != null
    ? `残り距離：約${distanceYards}ヤード（${Math.round(distanceMeters)}m）`
    : "残り距離：不明";

  const condPart = [
    `風：${WIND_LABELS[wind] ?? "不明"}`,
    windDir && windDir !== "none" ? `風向き：${WIND_DIR_LABELS[windDir]}` : null,
    `ライ：${LIE_LABELS[lie] ?? "不明"}`,
    `傾斜：${SLOPE_LABELS[slope] ?? "不明"}`,
  ].filter(Boolean).join("　");

  const userMsg = `${distPart}\nコース状況 — ${condPart}\n上記の状況を踏まえて詳細なアドバイスをお願いします。`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: CHARACTER_PROMPTS[character as CharacterId],
    messages: [{ role: "user", content: userMsg }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return NextResponse.json({ advice: text });
}
