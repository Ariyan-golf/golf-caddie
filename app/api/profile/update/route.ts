import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_CATEGORIES = new Set(["pro_coach", "amateur"]);
const ALLOWED_GENDERS    = new Set(["male", "female", "undisclosed"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    category?: string;
    birth_date?: string;
    gender?: string;
  };

  const updates: Record<string, unknown> = {};

  if (body.category != null) {
    if (!ALLOWED_CATEGORIES.has(body.category)) {
      return NextResponse.json({ error: "categoryの値が不正です" }, { status: 400 });
    }
    updates.category = body.category;
  }

  if (body.birth_date != null) {
    if (!DATE_RE.test(body.birth_date)) {
      return NextResponse.json({ error: "birth_dateの形式が不正です" }, { status: 400 });
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (body.birth_date < "1900-01-01" || body.birth_date > todayStr) {
      return NextResponse.json({ error: "birth_dateの範囲が不正です" }, { status: 400 });
    }
    updates.birth_date = body.birth_date;
  }

  if (body.gender != null) {
    if (!ALLOWED_GENDERS.has(body.gender)) {
      return NextResponse.json({ error: "genderの値が不正です" }, { status: 400 });
    }
    updates.gender = body.gender;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
