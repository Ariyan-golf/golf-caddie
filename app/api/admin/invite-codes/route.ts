import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code, role, plan, label } = await request.json() as {
    code: string;
    role: string;
    plan: string;
    label?: string;
  };

  if (!code || !role || !plan) {
    return NextResponse.json({ error: "code / role / plan は必須です" }, { status: 400 });
  }

  const { error } = await adminClient()
    .from("invite_codes")
    .insert({ code: code.toUpperCase(), role, plan, label: label ?? null });

  if (error) {
    const msg = error.code === "23505" ? "そのコードはすでに存在します" : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code } = await request.json() as { code: string };
  await adminClient().from("invite_codes").delete().eq("code", code);
  return NextResponse.json({ ok: true });
}
