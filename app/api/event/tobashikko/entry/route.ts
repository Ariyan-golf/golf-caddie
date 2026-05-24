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

  // shot_id がログイン中ユーザー自身のショットで、かつ club='1w' であることを検証。
  // shots → rounds.user_id 経路で所有権確認（RLS でも弾かれるが事前に明示エラーを返す）。
  const { data: shot, error: shotErr } = await supabase
    .from("shots")
    .select("id, club, rounds!inner(user_id)")
    .eq("id", shotId)
    .single();

  if (shotErr || !shot) {
    return NextResponse.json({ error: "ショットが見つかりません" }, { status: 404 });
  }
  const ownerId = (shot.rounds as unknown as { user_id: string }).user_id;
  if (ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (shot.club !== "1w") {
    return NextResponse.json(
      { error: "ドライバー（1W）のショットのみエントリーできます" },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await supabase
    .from("tobashikko_entries")
    .insert({ user_id: user.id, shot_id: shotId })
    .select("id, shot_id, driver_brand, driver_model, shaft_brand, shaft_model, ball_brand, ball_model")
    .single();

  if (error) {
    // UNIQUE 違反は二重エントリー
    if (error.code === "23505") {
      return NextResponse.json({ error: "すでにエントリー済みです" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry: inserted });
}
