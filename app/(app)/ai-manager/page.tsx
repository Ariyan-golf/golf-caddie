import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { AiManagerClient } from "./AiManagerClient";

export default async function AiManagerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", user!.id)
    .single();

  const isPremium = profile?.plan === "premium" || profile?.plan === "premium_paid";

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">🤖 AIマネージャー</h1>
        <p className="text-base text-green-600 mt-1">
          ゴルフ場のコース情報・ドレスコード・マナーをAIが案内します
        </p>
      </div>

      {isPremium ? (
        <AiManagerClient />
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
        <h2 className="text-xl font-bold text-green-800">プレミアムプラン限定</h2>
        <p className="text-base text-green-600 leading-relaxed">
          AIマネージャーはプレミアムプランのユーザーのみご利用いただける機能です。
        </p>
      </div>
      <div className="bg-green-50 rounded-xl p-4 text-left space-y-2">
        <p className="text-base font-semibold text-green-700">プレミアムプランの特典</p>
        <ul className="space-y-1.5 text-base text-green-700">
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> AIマネージャー（コース情報案内）
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> 番手アドバイス（無制限）
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span> スイング分析（無制限）
          </li>
        </ul>
      </div>
      <p className="text-sm text-green-400">
        プレミアムへのアップグレードはサポートまでお問い合わせください。
      </p>
    </div>
  );
}
