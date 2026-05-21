import { createClient } from "@/lib/supabase/server";
import { todayJST } from "@/lib/day-pass";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; course_id?: string }>;
}) {
  const { course_id = "" } = await searchParams;

  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect("/login");

  // day_pass_dateを確認（Webhookで既に更新済み）
  const { data: profile } = await supabase
    .from("profiles")
    .select("day_pass_date")
    .eq("id", user.id)
    .single();

  const today = todayJST();
  const isPaidToday = profile?.day_pass_date === today;

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
      <div className="text-center space-y-3">
        <div className="text-5xl">{isPaidToday ? "✅" : "⏳"}</div>
        <h1 className="text-2xl font-bold text-green-800">
          {isPaidToday ? "お支払い完了" : "決済処理中"}
        </h1>
        <p className="text-sm text-green-600">
          {isPaidToday
            ? "本日中、全機能がご利用いただけます"
            : "数秒後に自動で反映されます。少しお待ちください。"}
        </p>
      </div>

      {isPaidToday && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-600">本日のday_pass有効</p>
          <p className="text-lg font-semibold text-green-800 tabular-nums mt-1">
            {today} 23:59まで
          </p>
        </div>
      )}

      {course_id ? (
        <Link
          href={`/round/new?course=${course_id}`}
          className="block w-full py-3.5 rounded-xl text-base font-semibold text-center bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors"
        >
          ラウンドを開始する
        </Link>
      ) : (
        <Link
          href="/"
          className="block w-full py-3.5 rounded-xl text-base font-semibold text-center bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors"
        >
          ホームへ
        </Link>
      )}
    </div>
  );
}
