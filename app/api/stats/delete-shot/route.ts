import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { shotId } = await req.json() as { shotId?: string };
  if (!shotId) return NextResponse.json({ error: "shotId is required" }, { status: 400 });

  const { error } = await supabase
    .from("shot_distances")
    .delete()
    .eq("id", shotId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
