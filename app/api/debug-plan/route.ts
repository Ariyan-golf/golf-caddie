import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 通常クライアントで読んだ場合
  const { data: profileNormal, error: normalError } = await supabase
    .from("profiles")
    .select("id, plan, display_name")
    .eq("id", user.id)
    .single();

  // サービスロールで読んだ場合（RLSバイパス）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profileAdmin, error: adminError } = await admin
    .from("profiles")
    .select("id, plan, display_name")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    normal_client: {
      data: profileNormal,
      error: normalError?.message ?? null,
    },
    admin_client: {
      data: profileAdmin,
      error: adminError?.message ?? null,
    },
    auth_error: authError?.message ?? null,
  });
}
