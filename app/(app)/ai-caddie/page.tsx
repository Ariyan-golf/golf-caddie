import { createClient } from "@/lib/supabase/server";
import { hasFullAccess } from "@/lib/day-pass";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getClubAverages } from "@/lib/club-averages";
import type { ClubAverage } from "@/types";
import { AiCaddieClient, type InitialContext } from "./AiCaddieClient";

interface PageProps {
  // C8b ③: HoleRecorder からの遷移で round 文脈を受け取る。
  //   /ai-caddie?round=<id>&hole=<n>&distance=<y>
  // 全パラメータ無い場合は従来通りの手動入力 UI で動作。
  searchParams: Promise<{ round?: string; hole?: string; distance?: string }>;
}

export default async function AiCaddiePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const roundIdParam = params.round ?? null;
  const holeNum = params.hole ? parseInt(params.hole, 10) : NaN;
  const distanceNum = params.distance ? parseInt(params.distance, 10) : NaN;
  const validHole = Number.isFinite(holeNum) && holeNum >= 1 && holeNum <= 18;
  const validDistance = Number.isFinite(distanceNum) && distanceNum > 0;

  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ data: profile }, todayPayment, clubAverages] = await Promise.all([
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
    // 旧 club_averages テーブルを使わず、生 shots から都度集計（本人 user.id で絞り込み）。
    getClubAverages(admin, user!.id),
  ]);

  const hasAccess = hasFullAccess(profile ?? {}) || !!todayPayment;

  // ── C8b ③: round 文脈の取得（本人所有のラウンドである場合のみ） ────────
  let initialContext: InitialContext | null = null;
  if (roundIdParam && validHole && user) {
    const { data: round } = await supabase
      .from("rounds")
      .select("id, course_name, golf_course_id, course_tees(green_type)")
      .eq("id", roundIdParam)
      .eq("user_id", user.id)
      .maybeSingle();

    if (round) {
      // green_type 解決は round/[id]/page.tsx:91-93 のロジック流用。
      // course_tees.green_type は日本語ラベル ('サブグリーン'/'メイングリーン') で
      // green_centers の制約値 ('main'/'sub') と異なるので変換が必要。
      const rawGreenType = (round.course_tees as { green_type?: string } | null)?.green_type ?? null;
      const greenType: "main" | "sub" =
        rawGreenType === "サブグリーン" ? "sub" : "main";

      let par: number | null = null;
      let greenRegistered = false;
      const courseId = round.golf_course_id as string | null;

      if (courseId) {
        // Min版は18Hコース対象（course_section=''）。27H/36Hは par 自動取得を
        // 諦めて手動入力にフォールバック（AI のアドバイスには par 必須でないため OK）。
        const [{ data: courseHole }, { data: greenCenter }] = await Promise.all([
          supabase
            .from("course_holes")
            .select("par")
            .eq("course_id", courseId)
            .eq("course_section", "")
            .eq("hole_number", holeNum)
            .maybeSingle(),
          supabase
            .from("green_centers")
            .select("id")
            .eq("course_id", courseId)
            .eq("green_type", greenType)
            .eq("hole_number", holeNum)
            .maybeSingle(),
        ]);
        par = (courseHole?.par as number | null) ?? null;
        greenRegistered = !!greenCenter;
      }

      initialContext = {
        roundId: round.id as string,
        holeNumber: holeNum,
        courseName: (round.course_name as string | null) ?? "ラウンド",
        par,
        distance: validDistance ? distanceNum : null,
        greenRegistered,
      };
    }
  }

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
      <AiCaddieClient
        clubAverages={clubAverages as ClubAverage[]}
        hasAccess={hasAccess}
        initialContext={initialContext}
      />
    </div>
  );
}
