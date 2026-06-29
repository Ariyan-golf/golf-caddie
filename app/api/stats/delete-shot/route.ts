import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { shotId } = await req.json() as { shotId?: string };
  if (!shotId) return NextResponse.json({ error: "shotId is required" }, { status: 400 });

  // 論理削除：物理 DELETE せず deleted_at を立てる。
  // RLS enforces ownership via holes→rounds.user_id, so an explicit user_id
  // filter is not possible (shots has no user_id column). RLS will silently
  // drop attempts to update other users' shots.
  const { error } = await supabase
    .from("shots")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", shotId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
