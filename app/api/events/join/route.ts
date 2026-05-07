import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { event_id, event_code } =
    (await req.json()) as { event_id?: string; event_code?: string };

  if (!event_id || !event_code?.trim()) {
    return NextResponse.json({ error: "イベントIDとコードは必須です" }, { status: 400 });
  }

  const admin = adminDb();
  const today = new Date().toISOString().split("T")[0];

  const { data: event, error: evErr } = await admin
    .from("events")
    .select("id, event_type, event_code, start_date, end_date")
    .eq("id", event_id)
    .single();

  if (evErr || !event) {
    return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
  }
  if (event.event_type !== "comp") {
    return NextResponse.json({ error: "このイベントは参加登録不要です" }, { status: 400 });
  }
  if (event.start_date > today || event.end_date < today) {
    return NextResponse.json({ error: "開催期間外のイベントです" }, { status: 400 });
  }
  if (event.event_code !== event_code.trim().toUpperCase()) {
    return NextResponse.json({ error: "イベントコードが正しくありません" }, { status: 400 });
  }

  const { error: insertErr } = await admin
    .from("event_participants")
    .upsert(
      { event_id, user_id: user.id },
      { onConflict: "event_id,user_id", ignoreDuplicates: true }
    );

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
