import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 参加コード用アルファベット。紛らわしい 0/O/1/I を除いた英数大文字（32文字）。
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_INSERT_RETRY = 5;

function generateEventCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

// 一般ユーザー（幹事）向けコンペ作成。
// 既存の /api/admin/events（サービスロール・管理者限定）とは別物で、
// ここでは「ログインユーザーのセッションを持つクライアント」で INSERT し、
// events の RLS（created_by = auth.uid() の comp 行のみ INSERT 可）を効かせる。
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { event_name, date } = (await req.json()) as {
    event_name?: string;
    date?: string;
  };

  if (!event_name?.trim()) {
    return NextResponse.json({ error: "コンペ名は必須です" }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "開催日は必須です" }, { status: 400 });
  }

  // event_code は events_event_code_unique で一意制約あり。
  // 衝突（23505）時はコードを振り直して数回リトライする。
  for (let attempt = 0; attempt < MAX_INSERT_RETRY; attempt++) {
    const event_code = generateEventCode();

    const { data, error } = await supabase
      .from("events")
      .insert({
        event_name: event_name.trim(),
        event_type: "comp",
        created_by: user.id,        // RLS の created_by = auth.uid() を満たす
        start_date: date,
        end_date: date,             // コンペは1日想定（開始日＝終了日）
        event_code,
        course_id: null,            // 対象コースは次スライスで扱う
      })
      .select("id, event_name, event_code, start_date, end_date, event_type, created_by, created_at")
      .single();

    if (!error) {
      return NextResponse.json({ compe: data });
    }

    // 一意制約違反（event_code 重複）のときだけリトライ。それ以外は即エラー返却。
    if (error.code === "23505") {
      continue;
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { error: "参加コードの生成に失敗しました。もう一度お試しください。" },
    { status: 500 }
  );
}

// 自分が作成したコンペ一覧（新しい順）。
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("events")
    .select("id, event_name, event_code, start_date, end_date, event_type, created_by, created_at")
    .eq("event_type", "comp")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ compes: data ?? [] });
}
