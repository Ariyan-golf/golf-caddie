import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import { CheckoutButton } from "./CheckoutButton";
import { RoundPaymentButton } from "@/components/RoundPaymentButton";
import { CancelButton } from "./CancelButton";
import { ReflectionGate } from "./ReflectionGate";
import { isBetaMode } from "@/lib/betaMode";
import { todayJST } from "@/lib/day-pass";

// v4: 月額サブスク330円1本に統一。
// - free: 3回ラウンドの無料体験、データは1日後削除
// - premium: 全機能利用可、データ永続保持
const PLANS = [
  {
    key: "free",
    name: "無料体験",
    price: "0円",
    period: "",
    description: "3回ラウンド・データは1日後削除",
    features: [
      "全機能利用可（お試し）",
      "ラウンド記録（3回まで）",
      "データは翌日0:30に自動削除",
    ],
    limits: [
      "データは永続保持されません",
      "4回目以降はサブスク登録が必要",
    ],
    color: "border-gray-200",
    badge: null,
  },
  {
    key: "premium",
    name: "月額サブスク",
    price: "330円",
    period: "/月（税込）",
    description: "全機能利用可・データ永続保持",
    features: [
      "スコア記録（全期間データ永続保持）",
      "GPS飛距離測定（精度±5m）",
      "クラブ別平均飛距離の管理",
      "AIキャディ即座アドバイス（4キャラ）",
      "AIキャディ詳細アドバイス（風・ライ・傾斜込み）",
      "方位センサー連動コンパス＋グリーン方向",
      "グリーンセンター登録機能",
      "月間ランキング「飛ばしっこごっこ」参加",
    ],
    limits: [],
    color: "border-green-400",
    badge: "おすすめ",
  },
] as const;

interface Props {
  searchParams: Promise<{ success?: string; canceled?: string; plan?: string; golf_success?: string }>;
}

export default async function PlanPage({ searchParams }: Props) {
  const params = await searchParams;

  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // プラン取得はサービスロールで（RLSバイパス）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("plan, round_count, cancelled_at, day_pass_date")
    .eq("id", user!.id)
    .single();

  const currentPlan = profile?.plan ?? "free";
  const roundCount = profile?.round_count ?? 0;
  const alreadyCancelled = !!profile?.cancelled_at;

  // 旧 standard プランの既存ユーザーは premium と同等扱いで「月額サブスク」を現在のプランとして表示
  const isSubscriber = currentPlan === "premium" || currentPlan === "standard";

  const beta = isBetaMode();

  // 決済から戻った直後（?success / ?golf_success）、webhook が DB に反映するまでの間は
  // 決済ボタンを隠して「反映中…」を出し、再押下による二重決済を防ぐ。
  // 反映済み（サブスク=plan / 単発=day_pass_date が当日）なら通常表示に戻す。
  const reflectingSub = !!params.success && !isSubscriber;
  const reflectingGolf = !!params.golf_success && profile?.day_pass_date !== todayJST();

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
            <p className="font-bold text-green-800">月額サブスクへの登録完了！</p>
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
            <p className="text-sm text-blue-600 mt-0.5">220円のお支払いを受け付けました。楽しいゴルフを！</p>
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
            無料体験の上限（3ラウンド）に達しています。サブスク登録でデータが永続保持されます。
          </p>
        </div>
      )}

      <div className="space-y-4">
        {PLANS.map((plan) => {
          const isCurrent =
            plan.key === "premium" ? isSubscriber : currentPlan === plan.key;
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
                <ReflectionGate pending={reflectingSub}>
                  <CheckoutButton
                    plan="premium"
                    label={`月額サブスクに登録（${plan.price}${plan.period}）`}
                  />
                </ReflectionGate>
              )}
            </div>
          );
        })}
      </div>

      {!beta && (
        <div className="card bg-blue-50 border-blue-200 space-y-3 text-sm text-blue-700">
          <p className="font-semibold text-blue-800">⛳ 提携ゴルフ場でのご利用</p>
          <p>通常220円、サブスク会員は280円となります。</p>
          <p>サブスクとは別料金です。当日1回のみ有効です。</p>
          <ReflectionGate pending={reflectingGolf}>
            <RoundPaymentButton />
          </ReflectionGate>
        </div>
      )}

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
