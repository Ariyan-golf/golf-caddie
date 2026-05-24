import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_AGE_GROUPS = new Set(["20s", "30s", "40s", "50s", "60plus"]);
const ALLOWED_GENDERS    = new Set(["male", "female", "undisclosed"]);
const ALLOWED_CATEGORIES = new Set(["amateur", "pro_coach"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    nickname?:  string;
    age_group?: string;
    gender?:    string;
    category?:  string;
  };

  const nickname = (body.nickname ?? "").trim();
  if (!nickname) {
    return NextResponse.json({ error: "ニックネームを入力してください" }, { status: 400 });
  }
  if (nickname.length > 20) {
    return NextResponse.json({ error: "ニックネームは20文字以内で入力してください" }, { status: 400 });
  }
  if (!body.age_group || !ALLOWED_AGE_GROUPS.has(body.age_group)) {
    return NextResponse.json({ error: "年代の値が不正です" }, { status: 400 });
  }
  if (!body.gender || !ALLOWED_GENDERS.has(body.gender)) {
    return NextResponse.json({ error: "性別の値が不正です" }, { status: 400 });
  }
  if (!body.category || !ALLOWED_CATEGORIES.has(body.category)) {
    return NextResponse.json({ error: "区分の値が不正です" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      nickname,
      age_group: body.age_group,
      gender:    body.gender,
      category:  body.category,
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
