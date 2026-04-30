import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { RoundPaymentButton } from "@/components/RoundPaymentButton";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  // display_name が profiles に未保存の場合、user_metadata から補完して保存
  if (profile && !profile.display_name && user.user_metadata?.display_name) {
    await supabase
      .from("profiles")
      .update({ display_name: user.user_metadata.display_name })
      .eq("id", user.id);
  }

  const { data: recentRounds } = await supabase
    .from("rounds")
    .select("id, course_name, date, total_score")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(3);

  const { data: clubStats } = await supabase
    .from("club_averages")
    .select("club, average_distance_meters, shot_count")
    .eq("user_id", user.id)
    .order("shot_count", { ascending: false })
    .limit(5);

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
                GW明けより本格スタート予定。アプリ内課金システムに移行します。
                <span className="font-semibold text-white">今のうちにぜひお試しください！</span>
              </p>
            </div>
          </div>
          <Link
            href="/plan"
            className="block w-full text-center bg-white text-green-700 font-semibold
                       text-sm py-2.5 rounded-lg hover:bg-green-50 transition-colors"
          >
            プランを変更する →
          </Link>
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
            href="/advice"
            className="card flex flex-col items-center py-5 gap-2 hover:border-green-300 transition-colors"
          >
            <span className="text-3xl">🎯</span>
            <span className="font-semibold text-green-700 text-sm">番手アドバイス</span>
          </Link>
          <div className="card flex flex-col gap-2 py-4">
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl">⛳</span>
              <span className="font-semibold text-green-700 text-sm">提携ゴルフ場と連携</span>
              <span className="text-xs text-green-500">330円／ラウンド</span>
            </div>
            <RoundPaymentButton />
          </div>
          <Link
            href="/history"
            className="card flex flex-col items-center py-5 gap-2 hover:border-green-300 transition-colors"
          >
            <span className="text-3xl">📋</span>
            <span className="font-semibold text-green-700 text-sm">ショット履歴</span>
          </Link>
        </div>

        {/* Recent rounds */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-green-800">最近のラウンド</h2>
            <Link href="/round" className="text-xs text-green-600 underline">
              すべて見る
            </Link>
          </div>
          {recentRounds?.length ? (
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
