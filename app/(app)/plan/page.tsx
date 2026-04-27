import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const PLANS = [
  {
    key: "free",
    name: "無料プラン",
    price: "0円",
    period: "",
    description: "まずは試してみたい方へ",
    features: [
      "ラウンド記録（5回まで）",
      "GPS飛距離計測",
      "番手別平均飛距離",
    ],
    limits: ["AIキャディ機能なし", "スイング分析なし"],
    color: "border-gray-200",
    badge: null,
  },
  {
    key: "standard",
    name: "スタンダード",
    price: "330円",
    period: "/月",
    description: "本格的にスコアアップを目指す方へ",
    features: [
      "ラウンド記録（無制限）",
      "GPS飛距離計測",
      "番手別平均飛距離",
      "球筋分析",
      "ハンディキャップ分析",
    ],
    limits: [],
    color: "border-green-400",
    badge: "人気",
  },
  {
    key: "premium",
    name: "プレミアム",
    price: "770円",
    period: "/月",
    description: "AIの力で一段上のゴルフへ",
    features: [
      "スタンダードの全機能",
      "AIキャディ（番手アドバイス）",
      "AIスイングコーチ",
      "優先サポート",
    ],
    limits: [],
    color: "border-yellow-400",
    badge: "おすすめ",
  },
] as const;

export default async function PlanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, round_count")
    .eq("id", user!.id)
    .single();

  const currentPlan = profile?.plan ?? "free";
  const roundCount = profile?.round_count ?? 0;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">プラン選択</h1>
        <p className="text-sm text-green-600 mt-1">あなたに合ったプランをお選びください</p>
      </div>

      {currentPlan === "free" && roundCount >= 5 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm">
          <span>🔒</span>
          <p className="text-amber-700">
            無料プランの上限（5ラウンド）に達しています。アップグレードで無制限になります。
          </p>
        </div>
      )}

      <div className="space-y-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          return (
            <div
              key={plan.key}
              className={`card border-2 relative ${plan.color} ${isCurrent ? "ring-2 ring-green-500 ring-offset-2" : ""}`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-4 bg-green-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  {plan.badge}
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-3 py-0.5 rounded-full">
                  現在のプラン
                </span>
              )}

              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="font-bold text-green-800 text-lg">{plan.name}</h2>
                  <p className="text-xs text-green-500 mt-0.5">{plan.description}</p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-green-800">{plan.price}</span>
                  <span className="text-sm text-green-500">{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-1.5 mb-4">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-green-700">
                    <span className="text-green-500 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
                {plan.limits.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="flex-shrink-0">✕</span>
                    {l}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="w-full py-2.5 rounded-xl text-center text-sm font-semibold bg-green-100 text-green-600">
                  利用中
                </div>
              ) : plan.key === "free" ? (
                <div className="w-full py-2.5 rounded-xl text-center text-sm font-semibold bg-gray-100 text-gray-400">
                  ダウングレード不可
                </div>
              ) : (
                <button
                  disabled
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
                >
                  準備中
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-green-400 pb-2">
        決済システムは近日公開予定です。
      </p>

      <Link href="/" className="block text-center text-sm text-green-500 underline pb-4">
        ホームに戻る
      </Link>
    </div>
  );
}
