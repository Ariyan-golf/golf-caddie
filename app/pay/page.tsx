import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

// 旧: 1日パス（220円）の決済ページ。現在の全機能を無料で提供しているため、
// 決済は行わず案内とラウンド開始の導線だけを出す（提携ゴルフ場の QR 等から来た人向けに URL は残す）。
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ course_id?: string }>;
}) {
  const { course_id = "" } = await searchParams;

  const supabase = await createClient();
  // openPath（未ログインでも閲覧可）だが、middleware で必要に応じて refresh 済。
  // ここでは Cookie 読みのみの getSession() で十分。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const startHref = course_id ? `/round/new?course=${course_id}` : "/round/new";

  // 未ログイン: LINEログインへ誘導（ログイン後にラウンド開始画面へ）
  if (!user) {
    const lineHref = `/auth/line?redirect_to=${encodeURIComponent(startHref)}`;

    return (
      <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-green-800">本日のラウンド</h1>
          <p className="text-sm text-green-600">
            現在の全機能を無料でご利用いただけます。まずLINEでログインしてください
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
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-green-800">本日のラウンド</h1>
        <p className="text-sm text-green-600">
          現在の全機能を無料でご利用いただけます。お支払いの手続きは必要ありません。
        </p>
      </div>

      <Link
        href={startHref}
        className="block w-full py-3.5 rounded-xl text-base font-semibold text-center
                   bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors"
      >
        ラウンドを開始する
      </Link>
    </div>
  );
}
