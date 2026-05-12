import { createClient } from "@/lib/supabase/server";
import { hasActiveDayPass } from "@/lib/day-pass";
import Link from "next/link";
import { PayButton } from "./PayButton";

export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string }>;
}) {
  const { course_id = "" } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 未ログイン: LINEログインへ誘導（ログイン後に同じURLへ戻す）
  if (!user) {
    const redirectQuery = new URLSearchParams();
    if (course_id) redirectQuery.set("course_id", course_id);
    const redirectTo = `/pay${redirectQuery.toString() ? `?${redirectQuery.toString()}` : ""}`;
    const lineHref = `/auth/line?redirect_to=${encodeURIComponent(redirectTo)}`;

    return (
      <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-green-800">本日のラウンド利用</h1>
          <p className="text-sm text-green-600">
            まずLINEでログインしてください
          </p>
        </div>

        <Link
          href={lineHref}
          className="w-full py-3.5 rounded-xl text-base font-semibold text-white text-center
                     transition-colors hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#06C755" }}
        >
          LINEでログイン
        </Link>

        <p className="text-xs text-gray-400 text-center">
          ログイン後、220円のお支払いに進みます
        </p>
      </div>
    );
  }

  // ログイン済み: 本日のday_passが有効なら案内のみ
  const { data: profile } = await supabase
    .from("profiles")
    .select("day_pass_date")
    .eq("id", user.id)
    .single();

  const active = hasActiveDayPass(profile?.day_pass_date);

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-green-800">本日のラウンド利用</h1>
        <p className="text-sm text-green-600">
          220円で本日中、全機能をご利用いただけます
        </p>
      </div>

      <div className="bg-white border border-green-200 rounded-xl p-5 space-y-3">
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-gray-600">利用料金</span>
          <span className="text-2xl font-bold text-green-800 tabular-nums">¥220</span>
        </div>
        <p className="text-xs text-gray-500">
          本日23:59まで全機能が利用可能。翌日0時に自動で無料プランに戻ります。
        </p>
      </div>

      {active ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold text-green-800">
              ✓ 本日のday_passが有効です
            </p>
          </div>
          {course_id && (
            <Link
              href={`/round/new?course=${course_id}`}
              className="block w-full py-3.5 rounded-xl text-base font-semibold text-center
                         bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors"
            >
              ラウンドを開始する
            </Link>
          )}
        </div>
      ) : (
        <PayButton courseId={course_id} />
      )}
    </div>
  );
}
