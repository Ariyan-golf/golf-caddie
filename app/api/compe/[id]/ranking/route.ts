import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// コンペ（comp イベント）のドラコン／逆ドラコン ランキング集計 API。
//
//   - owner 認可：セッションクライアントで getUser → events を id 取得し、
//     event_type==='comp' かつ created_by===user.id でなければ 403。
//   - owner 認可を通過した場合のみ、他参加者のショットを読むため service role で集計する。
//   - 集計ルール：参加者(event_participants) × 開催日(events.start_date〜end_date)
//     × 対象ホール(event_dracon_holes.hole_number) × club='1w' の shots を拾い、
//       dracon  = ホールごと user ごとに distance_yards 最大、降順。
//       reverse = ホールごと user ごとに shot_number 最小（ティショット）、昇順。
//   - 順位採番はしない（表示側で行う）。service role キーはレスポンスに含めない。

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type Mode = "dracon" | "reverse";

interface RankingRecord {
  user_id:        string;
  display_name:   string;
  gender:         string | null;
  age_group:      string | null;
  distance_yards: number;
}

interface HoleRanking {
  hole_number: number;
  mode:        Mode;
  records:     RankingRecord[];
}

// PostgREST の埋め込みは 1:1 でも object/array どちらでも返り得るので両対応で取り出す。
function holeNumberOf(holes: unknown): number | null {
  const h = Array.isArray(holes) ? holes[0] : holes;
  const n = (h as { hole_number?: unknown } | null)?.hole_number;
  return typeof n === "number" ? n : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ── 認証 ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  // ── owner 認可（セッションクライアント・RLS 下で取得） ──
  const { data: event } = await supabase
    .from("events")
    .select("id, event_type, created_by, event_name, start_date, end_date, course_id")
    .eq("id", id)
    .maybeSingle();

  if (!event || event.event_type !== "comp" || event.created_by !== user.id) {
    return NextResponse.json(
      { error: "対象のコンペが見つからないか、閲覧する権限がありません" },
      { status: 403 }
    );
  }

  const eventInfo = {
    event_name: event.event_name,
    start_date: event.start_date,
    end_date:   event.end_date,
    course_id:  event.course_id as string | null,
  };

  // ── ここから service role（他参加者のショットを読むため RLS bypass） ──
  const admin = adminDb();

  // 1. 対象ホール（ドラコン／逆ドラコン）
  const { data: draconHoles } = await admin
    .from("event_dracon_holes")
    .select("hole_number, mode")
    .eq("event_id", id);

  const targetHoles = (draconHoles ?? []) as { hole_number: number; mode: Mode }[];
  if (targetHoles.length === 0) {
    return NextResponse.json({ ok: true, event: eventInfo, holes: [] });
  }

  // 各対象ホールの空ランキング（records:[]）を先に用意しておく。
  const emptyHoles: HoleRanking[] = targetHoles.map((h) => ({
    hole_number: h.hole_number,
    mode:        h.mode,
    records:     [],
  }));

  // 2. 参加者
  const { data: parts } = await admin
    .from("event_participants")
    .select("user_id")
    .eq("event_id", id);

  const participantIds = (parts ?? []).map((p: { user_id: string }) => p.user_id);
  if (participantIds.length === 0) {
    return NextResponse.json({ ok: true, event: eventInfo, holes: emptyHoles });
  }

  // 3. 期間内ラウンド（コースガードは JS 側で適用）
  const { data: rounds } = await admin
    .from("rounds")
    .select("id, user_id, date, golf_course_id")
    .in("user_id", participantIds)
    .gte("date", event.start_date)
    .lte("date", event.end_date);

  const roundUserMap = new Map<string, string>();
  for (const r of (rounds ?? []) as {
    id: string; user_id: string; date: string; golf_course_id: string | null;
  }[]) {
    // コースガード：双方が非 null のときだけ一致を要求。どちらか null なら通す。
    if (
      eventInfo.course_id != null &&
      r.golf_course_id != null &&
      r.golf_course_id !== eventInfo.course_id
    ) {
      continue;
    }
    roundUserMap.set(r.id, r.user_id);
  }

  const roundIds = Array.from(roundUserMap.keys());
  if (roundIds.length === 0) {
    return NextResponse.json({ ok: true, event: eventInfo, holes: emptyHoles });
  }

  // 4. 1w ショット（対象ラウンドのみ）。hole_number は holes 埋め込みから取得。
  const { data: shots } = await admin
    .from("shots")
    .select("shot_number, distance_yards, round_id, holes!inner(hole_number)")
    .eq("club", "1w")
    .in("round_id", roundIds);

  interface ShotLike {
    shot_number:    number;
    distance_yards: number | null;
    round_id:       string;
    holes:          unknown;
  }

  interface ShotRow {
    user_id:        string;
    hole_number:    number;
    shot_number:    number;
    distance_yards: number;
  }

  const shotRows: ShotRow[] = [];
  for (const s of (shots ?? []) as unknown as ShotLike[]) {
    if (s.distance_yards == null) continue;
    const holeN = holeNumberOf(s.holes);
    if (holeN == null) continue;
    const userId = roundUserMap.get(s.round_id);
    if (!userId) continue;
    shotRows.push({
      user_id:        userId,
      hole_number:    holeN,
      shot_number:    s.shot_number,
      distance_yards: s.distance_yards,
    });
  }

  // 5. profiles（表示名・属性）
  const { data: profs } = await admin
    .from("profiles")
    .select("id, nickname, age_group, gender")
    .in("id", participantIds);

  interface ProfRow {
    id:        string;
    nickname:  string | null;
    age_group: string | null;
    gender:    string | null;
  }
  const profMap = new Map((profs ?? []).map((p: ProfRow) => [p.id, p]));

  function displayName(userId: string): string {
    return profMap.get(userId)?.nickname?.trim() || "ゴルファー";
  }

  // ── 集計（対象ホールごと） ──
  const holes: HoleRanking[] = targetHoles.map((target) => {
    const rowsForHole = shotRows.filter((r) => r.hole_number === target.hole_number);

    // user ごとに採用ショットを 1 件選ぶ。
    //   dracon  : distance_yards 最大
    //   reverse : shot_number 最小（ティショット）
    const bestByUser = new Map<string, ShotRow>();
    for (const row of rowsForHole) {
      const prev = bestByUser.get(row.user_id);
      if (!prev) {
        bestByUser.set(row.user_id, row);
        continue;
      }
      if (target.mode === "dracon") {
        if (row.distance_yards > prev.distance_yards) bestByUser.set(row.user_id, row);
      } else {
        if (row.shot_number < prev.shot_number) bestByUser.set(row.user_id, row);
      }
    }

    const records: RankingRecord[] = Array.from(bestByUser.values()).map((row) => {
      const prof = profMap.get(row.user_id);
      return {
        user_id:        row.user_id,
        display_name:   displayName(row.user_id),
        gender:         prof?.gender ?? null,
        age_group:      prof?.age_group ?? null,
        distance_yards: row.distance_yards,
      };
    });

    // dracon は降順、reverse は昇順。順位採番はしない（表示側で行う）。
    records.sort((a, b) =>
      target.mode === "dracon"
        ? b.distance_yards - a.distance_yards
        : a.distance_yards - b.distance_yards
    );

    return { hole_number: target.hole_number, mode: target.mode, records };
  });

  return NextResponse.json({ ok: true, event: eventInfo, holes });
}
