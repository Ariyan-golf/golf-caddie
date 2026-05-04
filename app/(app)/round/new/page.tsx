import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { NewRoundForm } from "./NewRoundForm";

const FREE_ROUND_LIMIT = 3;

export default async function NewRoundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, round_count, role")
    .eq("id", user!.id)
    .single();

  const plan = profile?.plan ?? "free";
  const role = profile?.role ?? "general";
  const roundCount = profile?.round_count ?? 0;
  // pro ロールはラウンド上限なし・支払い不要
  const isBlocked = plan === "free" && roundCount >= FREE_ROUND_LIMIT && role !== "pro";

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">ラウンド開始</h1>
        <p className="text-sm text-green-600 mt-1">コース情報を入力してください</p>
      </div>

      {isBlocked ? (
        <div className="card space-y-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <span className="text-2xl flex-shrink-0">🔒</span>
            <div>
              <p className="font-semibold text-amber-800 text-sm">ラウンド上限に達しました</p>
              <p className="text-amber-700 text-sm mt-1">
                無料プランは{FREE_ROUND_LIMIT}ラウンドまでです。プランをアップグレードしてください。
              </p>
            </div>
          </div>
          <div className="text-center text-sm text-green-600">
            現在のラウンド数：<span className="font-bold text-green-800">{roundCount}</span> / {FREE_ROUND_LIMIT}
          </div>
          <Link href="/plan" className="btn-primary text-center block">
            プランをアップグレード
          </Link>
          <Link href="/round" className="block text-center text-sm text-green-500 underline">
            ラウンド一覧に戻る
          </Link>
        </div>
      ) : (
        <>
          {plan === "free" && role !== "pro" && (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-sm">
              <span className="text-green-600">
                残りラウンド数：<span className="font-bold text-green-800">{FREE_ROUND_LIMIT - roundCount}</span> / {FREE_ROUND_LIMIT}
              </span>
              <Link href="/plan" className="text-xs text-green-500 underline">
                アップグレード
              </Link>
            </div>
          )}
          <NewRoundForm />
        </>
      )}
    </div>
  );
}
