import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { club } = await req.json() as { club?: string };
  if (!club) return NextResponse.json({ error: "club is required" }, { status: 400 });

  // RLS enforces ownership via holes→rounds.user_id; shots has no user_id col.
  const { error } = await supabase
    .from("shots")
    .delete()
    .eq("club", club);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
