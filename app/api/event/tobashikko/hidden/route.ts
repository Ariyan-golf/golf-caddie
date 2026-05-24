import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { shot_id?: string };
  const shotId = body.shot_id;
  if (!shotId || !UUID_RE.test(shotId)) {
    return NextResponse.json({ error: "shot_id が不正です" }, { status: 400 });
  }

  // ショットの所有権を確認（shots → rounds.user_id 経路）。
  // shots テーブルは触らない（スタッツ画面の記録を壊さないため）。
  const { data: shot, error: shotErr } = await supabase
    .from("shots")
    .select("id, rounds!inner(user_id)")
    .eq("id", shotId)
    .single();

  if (shotErr || !shot) {
    return NextResponse.json({ error: "ショットが見つかりません" }, { status: 404 });
  }
  const ownerId = (shot.rounds as unknown as { user_id: string }).user_id;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("tobashikko_hidden_shots")
    .insert({ user_id: user.id, shot_id: shotId });

  if (error) {
    // UNIQUE 違反は「すでに非表示」状態なので冪等成功扱い。
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, already: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
