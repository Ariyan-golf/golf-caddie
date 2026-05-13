/**
 * 毎日 JST 0:30 (UTC 15:30) に Vercel Cron から呼ばれる。
 * payment_status='pending' かつ前日(JST)以前に作成された rounds を物理削除する。
 * holes / shots / round_payments は CASCADE で連動削除される。
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { todayJST } from "@/lib/day-pass";
import { isBetaMode } from "@/lib/betaMode";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isBetaMode()) {
    console.log("[cleanup-pending-rounds] beta mode active — skipping deletion");
    return NextResponse.json({ ok: true, skipped: "beta_mode", deleted: 0 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // JST 本日 0:00 より前の created_at を持つ pending ラウンドを削除
  const today = todayJST();
  const startOfTodayJST = new Date(`${today}T00:00:00+09:00`).toISOString();

  const { data: deleted, error } = await admin
    .from("rounds")
    .delete()
    .eq("payment_status", "pending")
    .lt("created_at", startOfTodayJST)
    .select("id");

  if (error) {
    console.error("[cleanup-pending-rounds] error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const count = deleted?.length ?? 0;
  console.log(`[cleanup-pending-rounds] deleted ${count} pending rounds (created before ${startOfTodayJST})`);
  return NextResponse.json({ ok: true, deleted: count });
}
