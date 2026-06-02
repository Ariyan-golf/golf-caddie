import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      terms_agreed_at: now,
      privacy_agreed_at: now,
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
