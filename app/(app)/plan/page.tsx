import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import { CheckoutButton } from "./CheckoutButton";
import { RoundPaymentButton } from "@/components/RoundPaymentButton";
import { CancelButton } from "./CancelButton";

const PLANS = [
  {
    key: "free",
    name: "無料プラン",
    price: "0円",
    period: "",
    description: "まずは試してみたい方へ",
    features: [
      "ラウンド記録（3回まで）",
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
      "AIキャディ（ルール確認）",
      "AIマネージャー（コース情報）",
      "番手アドバイス（無制限）",
      "優先サポート",
    ],
    limits: [],
    color: "border-yellow-400",
    badge: "おすすめ",
  },
] as const;

interface Props {
  searchParams: Promise<{ success?: string; canceled?: string; plan?: string; golf_success?: string }>;
}

export default async function PlanPage({ searchParams }: Props) {
  const params = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // プラン取得はサービスロールで（RLSバイパス）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("plan, round_count, cancelled_at")
    .eq("id", user!.id)
    .single();

  const currentPlan = profile?.plan ?? "free";
  const roundCount = profile?.round_count ?? 0;
  const alreadyCancelled = !!profile?.cancelled_at;

  const planLabel: Record<string, string> = {
    standard: "スタンダード",
    premium: "プレミアム",
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">プラン選択</h1>
        <p className="text-sm text-green-600 mt-1">あなたに合ったプランをお選びください</p>
      </div>

      {/* 決済完了通知 */}
      {params.success && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0">🎉</span>
          <div>
            <p className="font-bold text-green-800">
              {params.plan ? planLabel[params.plan] ?? "プラン" : "プラン"}へのアップグレード完了！
            </p>
            <p className="text-sm text-green-600 mt-0.5">
              ご登録ありがとうございます。すべての機能をご利用いただけます。
            </p>
          </div>
        </div>
      )}

      {/* ゴルフ場提携決済完了通知 */}
      {params.golf_success && (
        <div className="bg-blue-50 border border-blue-300 rounded-xl p-4 flex items-start gap-3">
          <span className="text-2xl shrink-0">⛳</span>
          <div>
            <p className="font-bold text-blue-800">ラウンド利用料のお支払いが完了しました！</p>
            <p className="text-sm text-blue-600 mt-0.5">330円のお支払いを受け付けました。楽しいゴルフを！</p>
          </div>
        </div>
      )}

      {/* キャンセル通知 */}
      {params.canceled && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-xl shrink-0">ℹ️</span>
          <p className="text-sm text-gray-600">決済がキャンセルされました。いつでもお申し込みいただけます。</p>
        </div>
      )}

      {currentPlan === "free" && roundCount >= 3 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm">
          <span>🔒</span>
          <p className="text-amber-700">
            無料プランの上限（3ラウンド）に達しています。アップグレードで無制限になります。
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
                    <span className="text-green-500 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
                {plan.limits.map((l) => (
                  <li key={l} className="flex items-center gap-2 text-sm text-gray-400">
                    <span className="shrink-0">✕</span>
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
                <CheckoutButton
                  plan={plan.key as "standard" | "premium"}
                  label={`${plan.name}プランに申し込む（${plan.price}${plan.period}）`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="card bg-blue-50 border-blue-200 space-y-3 text-sm text-blue-700">
        <p className="font-semibold text-blue-800">⛳ 提携ゴルフ場でのご利用</p>
        <p>330円/ラウンド（ゴルフ場110円・紹介者110円・健考社110円）</p>
        <p>サブスクとは別料金です。当日1回のみ有効です。</p>
        <RoundPaymentButton />
      </div>

      <div className="card bg-gray-50 border-gray-200 space-y-2 text-sm text-gray-600">
        <p className="font-semibold text-gray-700">お支払いについて</p>
        <ul className="space-y-1">
          <li>・クレジットカード（Visa/Mastercard/JCB等）でお支払いいただけます</li>
          <li>・毎月自動更新されます</li>
          <li>・解約はStripeカスタマーポータルからいつでも可能です</li>
          <li>・決済はStripeで安全に処理されます</li>
        </ul>
      </div>

      <div className="card bg-gray-50 border-gray-200 space-y-3">
        <p className="text-sm font-semibold text-gray-700">退会について</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          退会後30日間は引き続きサービスをご利用いただけます。翌月の請求は発生しません。
        </p>
        {alreadyCancelled ? (
          <div className="w-full py-2.5 rounded-xl text-center text-sm font-medium bg-gray-100 text-gray-400">
            退会申請済み
          </div>
        ) : (
          <CancelButton />
        )}
      </div>

      <Link href="/" className="block text-center text-sm text-green-500 underline pb-4">
        ホームに戻る
      </Link>
    </div>
  );
}
