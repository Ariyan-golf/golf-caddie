import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LEN = 100;

const FIELDS = [
  "driver_brand", "driver_model",
  "shaft_brand",  "shaft_model",
  "ball_brand",   "ball_model",
] as const;
type FieldKey = typeof FIELDS[number];

type NormalizeResult =
  | { kind: "skip" }              // フィールド未指定 → 触らない
  | { kind: "set"; value: string | null }
  | { kind: "too_long" };

function normalize(v: unknown): NormalizeResult {
  if (v === undefined) return { kind: "skip" };
  if (v === null) return { kind: "set", value: null };
  if (typeof v !== "string") return { kind: "skip" };
  const trimmed = v.trim();
  if (!trimmed) return { kind: "set", value: null };
  if (trimmed.length > MAX_TEXT_LEN) return { kind: "too_long" };
  return { kind: "set", value: trimmed };
}

const SELECT_COLS =
  "id, shot_id, driver_brand, driver_model, shaft_brand, shaft_model, ball_brand, ball_model";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id が不正です" }, { status: 400 });
  }

  const body = await request.json() as Partial<Record<FieldKey, unknown>>;
  const updates: Partial<Record<FieldKey, string | null>> = {};

  for (const key of FIELDS) {
    const r = normalize(body[key]);
    if (r.kind === "too_long") {
      return NextResponse.json(
        { error: `${key} が長すぎます（${MAX_TEXT_LEN}文字以内）` },
        { status: 400 }
      );
    }
    if (r.kind === "set") updates[key] = r.value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  // user_id 一致は RLS でも担保されるが、明示的に WHERE に入れて 404 を区別。
  const { data, error } = await supabase
    .from("tobashikko_entries")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SELECT_COLS)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "エントリーが見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, entry: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id が不正です" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tobashikko_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
