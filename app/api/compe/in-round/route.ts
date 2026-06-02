import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// ラウンド中の暫定順位フィードバック専用 API。
//
//   GET /api/compe/in-round?round_id=<uuid>&hole=<1-18>
//
//   - 判定・代表値・ソート・コースガードは app/api/compe/[id]/ranking/route.ts を
//     1ホール・このユーザーの順位に絞ってミラーしている（出力を既存ランキングと一致させるため）。
//   - 集計は他参加者のショットを読むため service role（adminDb）で行う。
//     認可は「自分の round 由来」かつ「自分が参加 or 作成のコンペ」に限定。
//   - 記録処理を壊さないため、入力不正・未ログイン・例外時も 500 を投げず
//     { ok, items: [] } を返す（呼び出し側は無害に無視できる）。

type Mode = "dracon" | "reverse";

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// PostgREST の埋め込みは 1:1 でも object/array どちらでも返り得るので両対応で取り出す。
function holeNumberOf(holes: unknown): number | null {
  const h = Array.isArray(holes) ? holes[0] : holes;
  const n = (h as { hole_number?: unknown } | null)?.hole_number;
  return typeof n === "number" ? n : null;
}

interface InRoundItem {
  eventId:         string;
  eventName:       string;
  holeNumber:      number;
  mode:            Mode;
  rank:            number;
  total:           number;
  myDistanceYards: number;
  gapYards:        number;
}

interface ShotRow {
  user_id:        string;
  hole_number:    number;
  shot_number:    number;
  distance_yards: number;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roundId = searchParams.get("round_id");
    const holeParam = searchParams.get("hole");
    const hole = holeParam != null ? Number(holeParam) : NaN;

    // 入力不正は無害に空返し。
    if (!roundId || !Number.isInteger(hole) || hole < 1 || hole > 18) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // 1. 認証（未ログインはエラーにせず空返し）。
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, items: [] });
    }

    const admin = adminDb();

    // 2. round 取得（自分の round 以外は漏らさない）。
    const { data: round } = await admin
      .from("rounds")
      .select("id, user_id, date, golf_course_id")
      .eq("id", roundId)
      .maybeSingle();

    if (!round || round.user_id !== user.id) {
      return NextResponse.json({ ok: true, items: [] });
    }
    const roundDate = round.date as string;
    const roundCourseId = round.golf_course_id as string | null;

    // 3. このホールを対象にしている event_dracon_holes（event_id, mode）。
    const { data: draconHoles } = await admin
      .from("event_dracon_holes")
      .select("event_id, mode")
      .eq("hole_number", hole);

    const draconList = (draconHoles ?? []) as { event_id: string; mode: Mode }[];
    if (draconList.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const eventIds = Array.from(new Set(draconList.map((d) => d.event_id)));

    // 該当 events を取得：comp かつ 開催日が round.date を含むもの。
    const { data: events } = await admin
      .from("events")
      .select("id, event_name, event_type, created_by, course_id, start_date, end_date")
      .in("id", eventIds)
      .eq("event_type", "comp")
      .lte("start_date", roundDate)
      .gte("end_date", roundDate);

    const items: InRoundItem[] = [];

    for (const event of (events ?? []) as {
      id: string; event_name: string; event_type: string;
      created_by: string | null; course_id: string | null;
      start_date: string; end_date: string;
    }[]) {
      // コースガード（ranking ミラー）：双方が非 null のときだけ一致を要求。どちらか null なら通す。
      if (
        event.course_id != null &&
        roundCourseId != null &&
        event.course_id !== roundCourseId
      ) {
        continue;
      }

      // このホールの mode。
      const mode = draconList.find((d) => d.event_id === event.id)?.mode;
      if (!mode) continue;

      // 4. 参加者（＋作成者）。認可：this user が created_by か参加者であること。
      const { data: parts } = await admin
        .from("event_participants")
        .select("user_id")
        .eq("event_id", event.id);

      const participantIds = Array.from(
        new Set([
          ...(parts ?? []).map((p: { user_id: string }) => p.user_id),
          ...(event.created_by ? [event.created_by] : []),
        ])
      );

      const isAllowed =
        event.created_by === user.id || participantIds.includes(user.id);
      if (!isAllowed || participantIds.length === 0) continue;

      // 期間内ラウンド（コースガードを JS 側で適用。ranking ミラー）。
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
        if (
          event.course_id != null &&
          r.golf_course_id != null &&
          r.golf_course_id !== event.course_id
        ) {
          continue;
        }
        roundUserMap.set(r.id, r.user_id);
      }

      const roundIds = Array.from(roundUserMap.keys());
      if (roundIds.length === 0) continue;

      // 1w ショット（対象ラウンドのみ）。hole_number は holes 埋め込みから取得。
      const { data: shots } = await admin
        .from("shots")
        .select("shot_number, distance_yards, round_id, holes!inner(hole_number)")
        .eq("club", "1w")
        .in("round_id", roundIds);

      const rowsForHole: ShotRow[] = [];
      for (const s of (shots ?? []) as unknown as {
        shot_number: number; distance_yards: number | null; round_id: string; holes: unknown;
      }[]) {
        if (s.distance_yards == null) continue;
        const holeN = holeNumberOf(s.holes);
        if (holeN == null || holeN !== hole) continue;   // 対象ホールに限定
        const userId = roundUserMap.get(s.round_id);
        if (!userId) continue;
        rowsForHole.push({
          user_id:        userId,
          hole_number:    holeN,
          shot_number:    s.shot_number,
          distance_yards: s.distance_yards,
        });
      }

      // user ごとに採用ショットを 1 件選ぶ（ranking ミラー）。
      //   dracon  : distance_yards 最大
      //   reverse : shot_number 最小（ティショット）
      const bestByUser = new Map<string, ShotRow>();
      for (const row of rowsForHole) {
        const prev = bestByUser.get(row.user_id);
        if (!prev) {
          bestByUser.set(row.user_id, row);
          continue;
        }
        if (mode === "dracon") {
          if (row.distance_yards > prev.distance_yards) bestByUser.set(row.user_id, row);
        } else {
          if (row.shot_number < prev.shot_number) bestByUser.set(row.user_id, row);
        }
      }

      // dracon は降順、reverse は昇順（ranking ミラー）。
      const records = Array.from(bestByUser.values());
      records.sort((a, b) =>
        mode === "dracon"
          ? b.distance_yards - a.distance_yards
          : a.distance_yards - b.distance_yards
      );

      // this user の順位・差を算出。自分の有効ショットが無ければスキップ。
      const myIndex = records.findIndex((r) => r.user_id === user.id);
      if (myIndex < 0) continue;

      const myDistanceYards = records[myIndex].distance_yards;
      const topDistance = records[0].distance_yards; // dracon=最長 / reverse=最短
      const gapYards =
        mode === "dracon"
          ? topDistance - myDistanceYards
          : myDistanceYards - topDistance;

      items.push({
        eventId:         event.id,
        eventName:       event.event_name,
        holeNumber:      hole,
        mode,
        rank:            myIndex + 1,
        total:           records.length,
        myDistanceYards,
        gapYards,
      });
    }

    return NextResponse.json({ ok: true, items });
  } catch {
    // 呼び出し側（ラウンド記録）を壊さないため、例外時も 500 を投げない。
    return NextResponse.json({ ok: false, items: [] });
  }
}
