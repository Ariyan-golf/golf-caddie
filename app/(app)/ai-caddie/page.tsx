import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { AiCaddieClient } from "./AiCaddieClient";

export default async function AiCaddiePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: profile }, todayPayment] = await Promise.all([
    admin.from("profiles").select("plan").eq("id", user!.id).single(),
    (async () => {
      const nowMs = Date.now();
      const jstMs = nowMs + 9 * 60 * 60 * 1000;
      const todayStr = new Date(jstMs).toISOString().slice(0, 10);
      const nextStr = new Date(jstMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await admin
        .from("round_payments")
        .select("id")
        .eq("user_id", user!.id)
        .gte("created_at", `${todayStr}T00:00:00+09:00`)
        .lt("created_at", `${nextStr}T00:00:00+09:00`)
        .limit(1)
        .maybeSingle();
      return data;
    })(),
  ]);

  const hasAccess = profile?.plan === "premium" || !!todayPayment;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">🏌️ AIキャディ</h1>
        <p className="text-base text-green-600 mt-1">
          GPSで残り距離を計測してキャラクターがコースアドバイスをお届けします
        </p>
      </div>

      {hasAccess ? (
        <AiCaddieClient />
      ) : (
        <PremiumGate />
      )}
    </div>
  );
}

function PremiumGate() {
  return (
    <div className="card space-y-5 text-center py-8">
      <div className="text-5xl">🔒</div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-green-800">ご利用には追加手続きが必要です</h2>
        <p className="text-base text-green-600 leading-relaxed">
          AIキャディはプレミアムプラン、または当日のラウンド利用料をお支払いいただいたユーザーのみご利用いただける機能です。
        </p>
      </div>
      <div className="bg-green-50 rounded-xl p-4 text-left space-y-3">
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-green-700">330円ラウンド支払い（当日限り）</p>
          <p className="text-sm text-green-600">
            ラウンド利用料をお支払いいただくと、当日中はAIキャディをご利用いただけます。
          </p>
        </div>
        <div className="border-t border-green-200 pt-3 space-y-1.5">
          <p className="text-base font-semibold text-green-700">プレミアムプラン（常時利用可）</p>
          <ul className="space-y-1.5 text-sm text-green-700">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> AIキャディ（ルール確認）
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> AIマネージャー（コース情報案内）
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 番手アドバイス・スイング分析（無制限）
            </li>
          </ul>
        </div>
      </div>
      <p className="text-sm text-green-400">
        プレミアムへのアップグレードはサポートまでお問い合わせください。
      </p>
    </div>
  );
}
