import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BRAND_LEN = 50;

function normalizeBrand(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;       // フィールド未指定 → 触らない
  if (v === null) return null;                  // 明示 null → クリア
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_BRAND_LEN) return undefined;
  return trimmed;
}

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

  const body = await request.json() as {
    driver_brand?: unknown;
    ball_brand?:   unknown;
  };

  const updates: Record<string, string | null> = {};
  const d = normalizeBrand(body.driver_brand);
  const b = normalizeBrand(body.ball_brand);
  if (d !== undefined) updates.driver_brand = d;
  if (b !== undefined) updates.ball_brand   = b;

  // 文字列だが長すぎ等で undefined に弾かれたケースを区別
  if (body.driver_brand !== undefined && d === undefined && body.driver_brand !== null) {
    return NextResponse.json({ error: "driver_brand が長すぎます（50文字以内）" }, { status: 400 });
  }
  if (body.ball_brand !== undefined && b === undefined && body.ball_brand !== null) {
    return NextResponse.json({ error: "ball_brand が長すぎます（50文字以内）" }, { status: 400 });
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
    .select("id, shot_id, driver_brand, ball_brand")
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
