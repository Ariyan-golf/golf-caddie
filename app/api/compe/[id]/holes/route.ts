import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Mode = "dracon" | "reverse";

interface HoleInput {
  hole_number: number;
  mode:        Mode;
}

// コンペのドラコン対象ホール（最大4・各ドラコン/逆ドラコン）の置き換え保存。
// service role は使わず、ログインユーザーのセッションで delete→insert し、
// event_dracon_holes の RLS（Creator can insert/delete: events.created_by=auth.uid()）
// に依存する。owner 以外は RLS で弾かれる前提だが、念のため API でも owner 判定する。
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = (await req.json()) as { holes?: unknown };
  const holes = body.holes;

  // ── バリデーション ──
  if (!Array.isArray(holes)) {
    return NextResponse.json({ error: "holes は配列で指定してください" }, { status: 400 });
  }
  if (holes.length > 4) {
    return NextResponse.json({ error: "対象ホールは最大4つまでです" }, { status: 400 });
  }

  const seen = new Set<number>();
  const cleaned: HoleInput[] = [];
  for (const h of holes) {
    const hole = h as { hole_number?: unknown; mode?: unknown };
    const n = hole.hole_number;
    const m = hole.mode;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 18) {
      return NextResponse.json({ error: "ホール番号は1〜18で指定してください" }, { status: 400 });
    }
    if (m !== "dracon" && m !== "reverse") {
      return NextResponse.json({ error: "種別が不正です" }, { status: 400 });
    }
    if (seen.has(n)) {
      return NextResponse.json({ error: "同じホール番号が重複しています" }, { status: 400 });
    }
    seen.add(n);
    cleaned.push({ hole_number: n, mode: m });
  }

  // ── owner 判定 ──
  const { data: event } = await supabase
    .from("events")
    .select("id, event_type, created_by")
    .eq("id", id)
    .maybeSingle();

  if (!event || event.event_type !== "comp" || event.created_by !== user.id) {
    return NextResponse.json(
      { error: "対象のコンペが見つからないか、設定する権限がありません" },
      { status: 403 }
    );
  }

  // ── 置き換え保存：既存を全削除 → 新規を一括挿入 ──
  const { error: delError } = await supabase
    .from("event_dracon_holes")
    .delete()
    .eq("event_id", id);

  if (delError) {
    return NextResponse.json({ error: delError.message }, { status: 400 });
  }

  if (cleaned.length > 0) {
    const { error: insError } = await supabase
      .from("event_dracon_holes")
      .insert(cleaned.map((h) => ({ event_id: id, hole_number: h.hole_number, mode: h.mode })));

    if (insError) {
      return NextResponse.json({ error: insError.message }, { status: 400 });
    }
  }

  // 保存後の状態を取得して返す。
  const { data: saved } = await supabase
    .from("event_dracon_holes")
    .select("hole_number, mode")
    .eq("event_id", id)
    .order("hole_number");

  return NextResponse.json({ ok: true, holes: saved ?? [] });
}
