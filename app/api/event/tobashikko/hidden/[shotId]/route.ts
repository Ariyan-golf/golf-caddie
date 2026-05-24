import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ shotId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { shotId } = await params;
  if (!UUID_RE.test(shotId)) {
    return NextResponse.json({ error: "shot_id が不正です" }, { status: 400 });
  }

  // user_id 一致は RLS でも担保されるが、明示 WHERE で他人のレコードを誤って消さないことを保証。
  // 既に存在しなかった場合も成功扱い（冪等）。
  const { error } = await supabase
    .from("tobashikko_hidden_shots")
    .delete()
    .eq("shot_id", shotId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
