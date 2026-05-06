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

interface RankingRow {
  rank: number;
  display_name: string;
  max_distance_meters: number;
  max_distance_yards: number;
  recorded_at: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = adminDb();
  const { id: eventId } = await params;

  // イベント取得
  const { data: event, error: evErr } = await admin
    .from("events")
    .select("*, golf_courses(name)")
    .eq("id", eventId)
    .single();

  if (evErr || !event) {
    return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
  }

  // 終了日の翌日（exclusive upper bound）
  const endExclusive = new Date(event.end_date);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const endStr = endExclusive.toISOString().split("T")[0];

  // 期間内の shot_distances を全件取得
  const { data: shots, error: shotErr } = await admin
    .from("shot_distances")
    .select("user_id, distance_meters, distance_yards, created_at")
    .gte("created_at", event.start_date)
    .lt("created_at", endStr);

  if (shotErr) return NextResponse.json({ error: shotErr.message }, { status: 500 });

  // ユーザーごとに最長飛距離レコードを集計
  const byUser = new Map<
    string,
    { distance_meters: number; distance_yards: number; created_at: string }
  >();
  for (const s of shots ?? []) {
    const existing = byUser.get(s.user_id);
    if (!existing || s.distance_meters > existing.distance_meters) {
      byUser.set(s.user_id, {
        distance_meters: Number(s.distance_meters),
        distance_yards: s.distance_yards,
        created_at: s.created_at,
      });
    }
  }

  if (byUser.size === 0) {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("format") === "csv") {
      return new Response("順位,名前,最長飛距離(m),最長飛距離(yd),記録日\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="event_ranking_${eventId}.csv"`,
        },
      });
    }
    return NextResponse.json({ event, ranking: [] });
  }

  // profiles を取得
  const userIds = Array.from(byUser.keys());
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? "—"]));

  // ランキング生成
  const ranking: RankingRow[] = Array.from(byUser.entries())
    .map(([userId, best]) => ({
      display_name: profileMap.get(userId) ?? "—",
      max_distance_meters: best.distance_meters,
      max_distance_yards: best.distance_yards,
      recorded_at: best.created_at,
    }))
    .sort((a, b) => b.max_distance_meters - a.max_distance_meters)
    .map((row, i) => ({ rank: i + 1, ...row }));

  // CSV 出力
  const { searchParams } = new URL(req.url);
  if (searchParams.get("format") === "csv") {
    const header = "順位,名前,最長飛距離(m),最長飛距離(yd),記録日\n";
    const body = ranking
      .map((r) =>
        [
          r.rank,
          `"${r.display_name}"`,
          r.max_distance_meters.toFixed(1),
          r.max_distance_yards,
          new Date(r.recorded_at).toLocaleDateString("ja-JP"),
        ].join(",")
      )
      .join("\n");

    return new Response(header + body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="event_ranking_${eventId}.csv"`,
      },
    });
  }

  return NextResponse.json({ event, ranking });
}
