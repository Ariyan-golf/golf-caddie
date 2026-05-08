import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { todayJST } from "@/lib/day-pass";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; course_id?: string }>;
}) {
  const { session_id, course_id = "" } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!session_id) {
    return <PayFailed message="セッションIDが見つかりません" courseId={course_id} />;
  }

  // Stripeで支払いを検証
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch {
    return <PayFailed message="決済情報の取得に失敗しました" courseId={course_id} />;
  }

  const sessionUserId = session.metadata?.user_id ?? session.client_reference_id;
  const isDayPass = session.metadata?.type === "day_pass";
  const isPaid = session.payment_status === "paid";

  if (!isDayPass || !isPaid || sessionUserId !== user.id) {
    return <PayFailed message="決済が確認できませんでした" courseId={course_id} />;
  }

  // day_pass_dateを本日(JST)で更新（idempotent）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  await admin
    .from("profiles")
    .update({ day_pass_date: todayJST() })
    .eq("id", user.id);

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
      <div className="text-center space-y-3">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold text-green-800">お支払い完了</h1>
        <p className="text-sm text-green-600">
          本日中、全機能がご利用いただけます
        </p>
      </div>

      <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
        <p className="text-xs text-gray-600">本日のday_pass有効</p>
        <p className="text-lg font-semibold text-green-800 tabular-nums mt-1">
          {todayJST()} 23:59まで
        </p>
      </div>

      {course_id ? (
        <Link
          href={`/round/new?course=${course_id}`}
          className="block w-full py-3.5 rounded-xl text-base font-semibold text-center
                     bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors"
        >
          ラウンドを開始する
        </Link>
      ) : (
        <Link
          href="/"
          className="block w-full py-3.5 rounded-xl text-base font-semibold text-center
                     bg-green-600 hover:bg-green-700 active:bg-green-800 text-white transition-colors"
        >
          ホームへ
        </Link>
      )}
    </div>
  );
}

function PayFailed({ message, courseId }: { message: string; courseId: string }) {
  const retryQuery = new URLSearchParams();
  if (courseId) retryQuery.set("course_id", courseId);
  const retryHref = `/pay${retryQuery.toString() ? `?${retryQuery.toString()}` : ""}`;

  return (
    <div className="min-h-screen p-4 max-w-md mx-auto flex flex-col justify-center space-y-6">
      <div className="text-center space-y-3">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold text-red-700">{message}</h1>
        <p className="text-sm text-gray-500">
          決済が完了していない可能性があります。再度お試しください。
        </p>
      </div>
      <Link
        href={retryHref}
        className="block w-full py-3 rounded-xl text-sm font-semibold text-center
                   bg-green-600 hover:bg-green-700 text-white transition-colors"
      >
        支払い画面に戻る
      </Link>
    </div>
  );
}
