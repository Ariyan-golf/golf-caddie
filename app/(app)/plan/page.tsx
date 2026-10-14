import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import { CancelButton } from "./CancelButton";

// 現在の全機能を無料で提供しているため、プラン選択・決済の導線は持たない。
// （ベータモードの有無にかかわらず同じ表示。退会のみここから行える）
const FEATURES = [
  "スコア記録（ラウンド数の上限なし・データの自動削除なし）",
  "GPS飛距離測定",
  "クラブ別平均飛距離の管理",
  "AIキャディ（即座アドバイス・詳細アドバイス）",
  "AIマネージャー",
  "方位センサー連動コンパス＋グリーン方向",
  "グリーンセンター登録機能",
  "飛ばしっこGO（ランキング）",
] as const;

export default async function PlanPage() {
  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  // 退会状態の取得はサービスロールで（RLSバイパス）
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("cancelled_at")
    .eq("id", user!.id)
    .single();

  const alreadyCancelled = !!profile?.cancelled_at;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">ご利用プラン</h1>
      </div>

      <div className="card border-2 border-green-400 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">✅</span>
          <div>
            <p className="font-bold text-green-800 text-lg">現在の全機能を無料でご利用いただけます</p>
            <p className="text-sm text-green-600 mt-1">
              お申し込みやお支払いの手続きは必要ありません。
            </p>
          </div>
        </div>
        <ul className="space-y-1.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-green-700">
              <span className="text-green-500 shrink-0">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500 leading-relaxed">
          将来、有料の追加機能を提供する場合は、その内容と料金を事前に本サービス上でお知らせします。
          お申し込みいただいた場合に限り料金が発生します。
        </p>
      </div>

      <div className="card bg-gray-50 border-gray-200 space-y-3">
        <p className="text-sm font-semibold text-gray-700">退会について</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          退会後30日間は引き続きサービスをご利用いただけます。
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
