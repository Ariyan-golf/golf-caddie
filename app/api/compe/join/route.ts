import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 参加コードだけでコンペに参加する。
// 既存の /api/events/join（event_id 指定・サービスロール）とは別物。
// ここではサービスロールを使わず、ログインユーザーのセッションを持つクライアントで実行し、
// event_participants の RLS（participants_insert_own: 本人の行のみ INSERT）を効かせる。
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { code } = (await req.json()) as { code?: string };
  const normalized = code?.trim().toUpperCase();
  if (!normalized) {
    return NextResponse.json({ error: "参加コードを入力してください" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];

  // 開催中の comp を event_code で1件検索。
  // events の SELECT は「認証ユーザーは閲覧可」なのでユーザーセッションで取得できる。
  // event_code は events_event_code_unique で一意のため maybeSingle で安全。
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id, event_name, event_type, event_code, start_date, end_date")
    .eq("event_type", "comp")
    .eq("event_code", normalized)
    .lte("start_date", today)
    .gte("end_date", today)
    .maybeSingle();

  if (evErr) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json(
      { error: "コードに一致する開催中のコンペが見つかりません" },
      { status: 404 }
    );
  }

  // 本人の参加行のみ upsert（RLS: participants_insert_own）。
  // UNIQUE(event_id,user_id) で重複は無害＝既に参加済みでも成功扱い。
  const { error: insertErr } = await supabase
    .from("event_participants")
    .upsert(
      { event_id: event.id, user_id: user.id },
      { onConflict: "event_id,user_id", ignoreDuplicates: true }
    );

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event_name: event.event_name });
}
