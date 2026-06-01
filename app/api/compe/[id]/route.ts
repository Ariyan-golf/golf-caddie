import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// コンペ（comp イベント）の「ゴルフ場・開催日」更新。
// service role は使わず、ログインユーザーのセッションで UPDATE し、
// events の RLS（Owners can update own comp events: event_type='comp' AND created_by=auth.uid()）
// に依存する。owner 以外・comp 以外は RLS で更新対象にならず 0 件になる。
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { course_id, date } = (await req.json()) as {
    course_id?: string | null;
    date?: string;
  };

  if (!date) {
    return NextResponse.json({ error: "開催日は必須です" }, { status: 400 });
  }

  // コンペは1日想定（開始日＝終了日）。course_id 未指定は null（未登録コース）。
  const { data, error } = await supabase
    .from("events")
    .update({
      course_id: course_id ?? null,
      start_date: date,
      end_date: date,
    })
    .eq("id", id)
    .select("id, course_id, start_date, end_date")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // RLS で本人の comp 以外は更新対象にならず 0 件 → data は null。
  if (!data) {
    return NextResponse.json(
      { error: "対象のコンペが見つからないか、更新する権限がありません" },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, event: data });
}
