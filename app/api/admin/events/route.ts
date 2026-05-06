import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = adminDb();
  const { data, error } = await admin
    .from("events")
    .select("*, golf_courses(name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = adminDb();
  const { event_name, course_id, hole_number, start_date, end_date } =
    await req.json() as {
      event_name: string;
      course_id: string;
      hole_number: number;
      start_date: string;
      end_date: string;
    };

  if (!event_name?.trim()) {
    return NextResponse.json({ error: "イベント名は必須です" }, { status: 400 });
  }
  if (!course_id) {
    return NextResponse.json({ error: "ゴルフ場を選択してください" }, { status: 400 });
  }
  if (!hole_number || hole_number < 1 || hole_number > 18) {
    return NextResponse.json({ error: "ホール番号は1〜18で入力してください" }, { status: 400 });
  }
  if (!start_date || !end_date) {
    return NextResponse.json({ error: "開始日・終了日は必須です" }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "終了日は開始日以降にしてください" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("events")
    .insert({ event_name: event_name.trim(), course_id, hole_number, start_date, end_date })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = adminDb();
  const { eventId } = await req.json() as { eventId?: string };
  if (!eventId) return NextResponse.json({ error: "eventId is required" }, { status: 400 });

  const { error } = await admin.from("events").delete().eq("id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
