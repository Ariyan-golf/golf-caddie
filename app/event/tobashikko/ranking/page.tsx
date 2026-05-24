import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";

export const dynamic = "force-dynamic";

// 公開ランキング情報のみ。本名・メール・user_id 等の個人情報はクライアントに出さない。
interface PublicRankingRow {
  rank:           number;
  nickname:       string;
  distance_yards: number;
  driver_text:    string | null;   // "テーラーメイド Qi10LS 9.5度" 等
  course_name:    string;
  round_date:     string;          // YYYY-MM-DD
}

interface ActiveEvent {
  id:         string;
  event_name: string;
  start_date: string;
  end_date:   string;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ja-JP");
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-sm font-bold text-amber-700">{rank}</span>;
}

export default async function PublicTobashikkoRankingPage() {
  // 公開ページなので Service Role で集計（RLS bypass）。
  // 個人情報がクライアントに漏れないよう、外に出すデータは明示的に絞り込む。
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const todayStr = new Date().toISOString().split("T")[0];

  // ── 開催中の飛ばしっこGOイベントを取得 ─────────────────────────
  const { data: events } = await admin
    .from("events")
    .select("id, event_name, start_date, end_date")
    .eq("event_type", "tobashikko")
    .lte("start_date", todayStr)
    .gte("end_date",   todayStr)
    .order("start_date", { ascending: false })
    .limit(1);

  const event: ActiveEvent | undefined = events?.[0];

  if (!event) {
    return (
      <PageShell>
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🏌️</p>
          <p className="text-green-600 font-semibold">現在開催中の飛ばしっこGOはありません</p>
        </div>
      </PageShell>
    );
  }

  // ── tobashikko_entries → shots → holes → rounds をネスト取得 ──
  const { data: entryRows } = await admin
    .from("tobashikko_entries")
    .select(`
      user_id, driver_brand, driver_model,
      shots!inner(distance_yards, holes!inner(rounds!inner(course_name, date)))
    `);

  interface EntryLike {
    user_id:      string;
    driver_brand: string | null;
    driver_model: string | null;
    shots: {
      distance_yards: number | null;
      holes: {
        rounds: {
          course_name: string;
          date:        string;
        };
      };
    } | null;
  }

  // 期間内フィルタ（ラウンド日 = rounds.date が event の start〜end に収まるもの）。
  // ひとり 1 記録（最高飛距離）に絞る。
  const byUser = new Map<string, {
    user_id:        string;
    driver_brand:   string | null;
    driver_model:   string | null;
    distance_yards: number;
    course_name:    string;
    round_date:     string;
  }>();

  for (const row of (entryRows ?? []) as unknown as EntryLike[]) {
    const shot   = row.shots;
    const date   = shot?.holes?.rounds?.date;
    const course = shot?.holes?.rounds?.course_name;
    const yards  = shot?.distance_yards;
    if (!shot || !date || !course || yards == null) continue;
    if (date < event.start_date || date > event.end_date) continue;

    const prev = byUser.get(row.user_id);
    if (!prev || yards > prev.distance_yards) {
      byUser.set(row.user_id, {
        user_id:        row.user_id,
        driver_brand:   row.driver_brand,
        driver_model:   row.driver_model,
        distance_yards: yards,
        course_name:    course,
        round_date:     date,
      });
    }
  }

  let ranking: PublicRankingRow[] = [];
  if (byUser.size > 0) {
    // nickname を取得（user_id 配列は集計内で使うのみで、クライアントには出さない）
    const userIds = Array.from(byUser.keys());
    const { data: profs } = await admin
      .from("profiles")
      .select("id, nickname")
      .in("id", userIds);
    const nameMap = new Map(
      (profs ?? []).map((p: { id: string; nickname: string | null }) => [p.id, p.nickname])
    );

    ranking = Array.from(byUser.values())
      .sort((a, b) => b.distance_yards - a.distance_yards)
      .map((row, i) => {
        const driverText =
          row.driver_brand && row.driver_model
            ? `${row.driver_brand} ${row.driver_model}`
            : row.driver_brand || row.driver_model || null;
        return {
          rank:           i + 1,
          nickname:       nameMap.get(row.user_id)?.trim() || "ゴルファー",
          distance_yards: row.distance_yards,
          driver_text:    driverText,
          course_name:    row.course_name,
          round_date:     row.round_date,
        };
      });
  }

  return (
    <PageShell>
      {/* 開催中イベント情報 */}
      <div className="card border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50">
        <p className="text-xs font-bold text-amber-700 mb-1">🚀 開催中</p>
        <h2 className="text-lg font-bold text-amber-900">{event.event_name}</h2>
        <p className="text-xs text-amber-600 mt-1">
          {fmtDate(event.start_date)} 〜 {fmtDate(event.end_date)}
        </p>
      </div>

      {/* ランキング */}
      {ranking.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-4xl mb-3">🏌️</p>
          <p className="text-green-600 font-semibold">まだエントリーがありません</p>
        </div>
      ) : (
        <div className="card space-y-2">
          {ranking.map((row) => (
            <div
              key={`${row.rank}-${row.nickname}-${row.round_date}`}
              className={`flex items-center gap-3 py-2 border-b border-green-50 last:border-0 ${
                row.rank === 1 ? "bg-yellow-50/40 -mx-2 px-2 rounded" :
                row.rank === 2 ? "bg-gray-50/60  -mx-2 px-2 rounded" :
                row.rank === 3 ? "bg-orange-50/40 -mx-2 px-2 rounded" : ""
              }`}
            >
              <div className="w-9 text-center flex-shrink-0">
                <Medal rank={row.rank} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-green-900 truncate">{row.nickname}</p>
                {row.driver_text && (
                  <p className="text-xs text-green-500 truncate">{row.driver_text}</p>
                )}
                <p className="text-[10px] text-green-400 truncate">
                  {row.course_name} {fmtDate(row.round_date)}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-amber-800 tabular-nums">
                  {row.distance_yards}
                  <span className="text-xs font-normal text-amber-500 ml-0.5">yd</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ── ページ共通シェル（ヘッダー + フッター） ─────────────────────────
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-10">
      <div className="max-w-lg mx-auto p-4 space-y-5">
        <div className="pt-4">
          <h1 className="text-2xl font-bold text-green-800">飛ばしっこGO ランキング</h1>
          <p className="text-xs text-green-500 mt-1">
            ひとり1記録（期間内ベスト飛距離）を集計しています
          </p>
        </div>
        {children}
        <div className="pt-2 text-center">
          <Link href="/" className="text-xs text-green-600 underline">
            トップへ
          </Link>
        </div>
      </div>
    </div>
  );
}
