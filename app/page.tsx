import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Navigation } from "@/components/Navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { RoundPaymentButton } from "@/components/RoundPaymentButton";
import { RoundBarGraph } from "@/components/RoundBarGraph";
import { EventRankingSection, type EventRankingData } from "@/components/EventRankingSection";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // ── 開催中イベントランキング ──────────────────────────────────────────
  const adminDb = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const todayStr = new Date().toISOString().split("T")[0];

  const { data: activeEvents } = await adminDb
    .from("events")
    .select("*, golf_courses(name)")
    .lte("start_date", todayStr)
    .gte("end_date", todayStr)
    .order("created_at", { ascending: false });

  const eventRankings: EventRankingData[] = await Promise.all(
    (activeEvents ?? []).map(async (event) => {
      const endExclusive = new Date(event.end_date);
      endExclusive.setDate(endExclusive.getDate() + 1);
      const endStr = endExclusive.toISOString().split("T")[0];

      let participantIds: string[] | null = null;
      let isParticipant = false;

      if (event.event_type === "comp") {
        const { data: parts } = await adminDb
          .from("event_participants")
          .select("user_id")
          .eq("event_id", event.id);
        participantIds = (parts ?? []).map((p: { user_id: string }) => p.user_id);
        isParticipant = participantIds.includes(user.id);
        if (participantIds.length === 0) {
          return { event, ranking: [], myRank: null, isParticipant: false };
        }
      }

      const baseQuery = adminDb
        .from("shot_distances")
        .select("user_id, distance_meters, distance_yards")
        .gte("created_at", event.start_date)
        .lt("created_at", endStr);

      const { data: shots } =
        participantIds !== null
          ? await baseQuery.in("user_id", participantIds)
          : await baseQuery;

      const byUser = new Map<string, { distance_meters: number; distance_yards: number }>();
      for (const s of shots ?? []) {
        const m = Number(s.distance_meters);
        const cur = byUser.get(s.user_id);
        if (!cur || m > cur.distance_meters) {
          byUser.set(s.user_id, { distance_meters: m, distance_yards: s.distance_yards });
        }
      }

      if (byUser.size === 0) {
        return { event, ranking: [], myRank: null, isParticipant };
      }

      const uids = Array.from(byUser.keys());
      const { data: profs } = await adminDb
        .from("profiles")
        .select("id, display_name")
        .in("id", uids);
      const profMap = new Map(
        (profs ?? []).map((p: { id: string; display_name: string | null }) => [
          p.id,
          p.display_name ?? "—",
        ])
      );

      const ranked = Array.from(byUser.entries())
        .map(([uid, best]) => ({
          user_id: uid,
          display_name: profMap.get(uid) ?? "—",
          max_distance_meters: best.distance_meters,
          max_distance_yards: best.distance_yards,
        }))
        .sort((a, b) => b.max_distance_meters - a.max_distance_meters)
        .map((row, i) => ({ ...row, rank: i + 1 }));

      const myEntry = ranked.find((r) => r.user_id === user.id);
      const myRank = myEntry
        ? {
            rank: myEntry.rank,
            max_distance_meters: myEntry.max_distance_meters,
            max_distance_yards: myEntry.max_distance_yards,
          }
        : null;

      const ranking = ranked.map(({ user_id: _uid, ...rest }) => rest);
      return { event, ranking, myRank, isParticipant };
    })
  );
  // ─────────────────────────────────────────────────────────────────────

  const [{ data: profile }, { data: roundsRaw }, { data: clubStats }, { data: handicapData }] =
    await Promise.all([
      supabase.from("profiles").select("display_name, day_pass_date, plan").eq("id", user.id).single(),
      supabase
        .from("rounds")
        .select("id, course_name, date, total_score, holes(putts)")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(10),
      supabase
        .from("club_averages")
        .select("club, average_distance_meters, shot_count")
        .eq("user_id", user.id)
        .order("shot_count", { ascending: false })
        .limit(5),
      supabase
        .from("rounds")
        .select("handicap_differential")
        .eq("user_id", user.id)
        .not("handicap_differential", "is", null)
        .order("date", { ascending: false })
        .limit(20),
    ]);

  // 本日day_pass有効か判定
  const isPaidToday = profile?.day_pass_date === todayStr;
  const isPremium = profile?.plan === "premium";
  const isSubscriber = profile?.plan === "standard" || profile?.plan === "premium";
  const hasFullAccess = isPaidToday || isPremium;
  const roundPrice = isSubscriber ? 280 : 330;

  // スコアあり10ラウンド分のグラフデータ
  const graphData = (roundsRaw ?? []).map((r) => {
    const holes = (r as { holes?: { putts: number | null }[] }).holes ?? [];
    const hasPutts = holes.some((h) => h.putts != null);
    return {
      id: r.id,
      course_name: r.course_name,
      date: r.date,
      total_score: r.total_score,
      total_putts: hasPutts ? holes.reduce((s, h) => s + (h.putts ?? 0), 0) : null,
    };
  });

  const recentRounds = graphData.slice(0, 5);

  // GCAハンディ計算
  const diffs = (handicapData ?? [])
    .map((r) => r.handicap_differential as number)
    .filter((d) => d != null);
  let gcaHandicap: string | null = null;
  if (diffs.length >= 8) {
    const best8 = [...diffs].sort((a, b) => a - b).slice(0, 8);
    const avg = best8.reduce((s, d) => s + d, 0) / 8;
    gcaHandicap = (Math.round(avg * 0.96 * 10) / 10).toFixed(1);
  }

  if (profile && !profile.display_name && user.user_metadata?.display_name) {
    await supabase
      .from("profiles")
      .update({ display_name: user.user_metadata.display_name })
      .eq("id", user.id);
  }

  const displayName =
    profile?.display_name ??
    (user.user_metadata?.display_name as string | undefined) ??
    "ゴルファー";

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-lg mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="pt-4 flex items-center justify-between">
          <div>
            <p className="text-green-600 text-sm">おかえりなさい</p>
            <h1 className="text-2xl font-bold text-green-800">{displayName} さん</h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
              <span className="text-2xl">⛳</span>
            </div>
            <LogoutButton />
          </div>
        </div>

        {/* Announcement Banner */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 rounded-xl p-4 shadow-md space-y-3">
          <div className="flex gap-3 items-start">
            <span className="text-xl flex-shrink-0 mt-0.5">📢</span>
            <div className="space-y-1">
              <p className="text-white font-bold text-sm tracking-wide">
                🏌️ テスト期間中 ― 現在は無料でご利用いただけます
              </p>
              <p className="text-green-100 text-xs leading-relaxed">
                5月15日より本格スタート予定。アプリ内課金システムに移行します。
                <span className="font-semibold text-white">今のうちにぜひお試しください！</span>
              </p>
            </div>
          </div>
          <Link
            href="/plan"
            className="block w-full text-center bg-white text-green-700 font-semibold text-sm py-2.5 rounded-lg hover:bg-green-50 transition-colors"
          >
            プランを変更する →
          </Link>
        </div>

        {/* 開催中イベント */}
        {eventRankings.length > 0 && (
          <EventRankingSection events={eventRankings} />
        )}

        {/* GCAハンディ */}
        <div className="card flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-green-500 font-medium mb-0.5">GCAハンディ</p>
            <p className="text-xl font-bold text-green-800">
              {gcaHandicap !== null ? gcaHandicap : "ラウンドデータ蓄積中"}
            </p>
          </div>
          <p className="text-xs text-green-400 text-right leading-relaxed shrink-0 max-w-[140px]">
            JGA方式に準じた計算です。<br />公式ハンディキャップではありません。
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/round/new"
            className="card flex flex-col items-center py-5 gap-2 hover:border-green-300 transition-colors"
          >
            <span className="text-3xl">🏌️</span>
            <span className="font-semibold text-green-700 text-sm">ラウンド開始</span>
          </Link>
          <Link
            href="/ai-caddie"
            className="card flex flex-col items-center py-5 gap-2 hover:border-green-300 transition-colors"
          >
            <div className="w-12 h-12 overflow-hidden rounded-xl">
              <Image
                src="/characters/ai.png"
                alt="AIちゃん"
                width={48}
                height={48}
                className="w-full h-full object-cover object-top"
              />
            </div>
            <span className="font-semibold text-green-700 text-sm">AIキャディ</span>
          </Link>
        </div>

        {/* Score & putts bar graph */}
        <RoundBarGraph data={graphData} />

        {/* Partnership payment / Day pass status */}
        {hasFullAccess ? (
          <div className="card bg-green-50 border-green-300 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-800 text-sm">
                  {isPaidToday ? "本日のラウンド利用中" : isPremium ? "プレミアムプラン利用中" : "スタンダードプラン利用中"}
                </p>
                <p className="text-xs text-green-600">
                  {isPaidToday ? "本日23:59まで全機能利用可能" : `※ゴルフ場ラウンドは別料金（${roundPrice}円/回）`}
                </p>
              </div>
            </div>
            {!isPaidToday && <RoundPaymentButton />}
          </div>
        ) : (
          <div className="card space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⛳</span>
              <div>
                <p className="font-semibold text-green-700 text-sm">提携ゴルフ場と連携</p>
                <p className="text-xs text-green-500">{roundPrice}円／ラウンド</p>
              </div>
            </div>
            <RoundPaymentButton />
          </div>
        )}

        {/* Recent rounds */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-green-800">最近のラウンド</h2>
            <Link href="/round" className="text-xs text-green-600 underline">
              すべて見る
            </Link>
          </div>
          {recentRounds.length ? (
            <div className="space-y-2">
              {recentRounds.map((round) => (
                <Link
                  key={round.id}
                  href={`/round/${round.id}`}
                  className="flex items-center justify-between py-2 border-b border-green-50 last:border-0"
                >
                  <div>
                    <p className="font-medium text-green-800 text-sm">{round.course_name}</p>
                    <p className="text-xs text-green-500">
                      {new Date(round.date).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                  {round.total_score && (
                    <span className="badge bg-green-100 text-green-700 font-bold">
                      {round.total_score}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-green-400 text-center py-4">
              まだラウンドがありません。
              <br />
              ラウンド開始から記録しましょう！
            </p>
          )}
        </div>

        {/* Club averages */}
        {clubStats && clubStats.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-green-800 mb-3">番手別平均飛距離</h2>
            <div className="space-y-2">
              {clubStats.map((stat) => (
                <div key={stat.club} className="flex items-center justify-between">
                  <span className="text-sm text-green-700">{stat.club}</span>
                  <span className="text-sm font-semibold text-green-800">
                    {Math.round(stat.average_distance_meters * 1.09361)}y
                    <span className="text-xs text-green-400 font-normal ml-1">
                      ({stat.shot_count}打)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Navigation />
    </div>
  );
}
