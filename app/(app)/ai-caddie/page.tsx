import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/day-pass";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { AiCaddieClient } from "./AiCaddieClient";

export default async function AiCaddiePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: profile }, todayPayment, { data: clubAverages }] = await Promise.all([
    admin.from("profiles").select("plan, day_pass_date").eq("id", user!.id).single(),
    (async () => {
      const nowMs = Date.now();
      const jstMs = nowMs + 9 * 60 * 60 * 1000;
      const todayStr = new Date(jstMs).toISOString().slice(0, 10);
      const nextStr  = new Date(jstMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await admin
        .from("round_payments")
        .select("id")
        .eq("user_id", user!.id)
        .gte("created_at", `${todayStr}T00:00:00+09:00`)
        .lt("created_at",  `${nextStr}T00:00:00+09:00`)
        .limit(1)
        .maybeSingle();
      return data;
    })(),
    admin.from("club_averages").select("*").eq("user_id", user!.id),
  ]);

  const hasAccess = hasFullAccess(profile ?? {}) || !!todayPayment;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">🏌️ AIキャディ</h1>
        <p className="text-base text-green-600 mt-1">
          GPSで残り距離を計測してキャラクターがコースアドバイスをお届けします
        </p>
      </div>
      <AiCaddieClient clubAverages={clubAverages ?? []} hasAccess={hasAccess} />
    </div>
  );
}
