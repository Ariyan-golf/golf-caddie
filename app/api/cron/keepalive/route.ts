/**
 * Supabase の自動停止（無料プランで一定期間 外部 API アクセスが無いとプロジェクトが
 * 停止する）を防ぐための keepalive ルート。Vercel Cron から毎日呼ばれ、profiles を
 * 1 行 read するだけの軽量クエリで「外部からの API アクセス」を発生させる。
 *
 * このルートには意図的に認証チェックとベータモード分岐を持たせない:
 *  - 認証チェック（Bearer CRON_SECRET）を入れると、CRON_SECRET の設定不備で 401 となり
 *    Supabase に到達しないリスクがある（既存 cron で疑われている事象）。
 *  - isBetaMode() 分岐を入れると、ベータモード ON（既定 true）で早期 return し、
 *    Supabase に到達しない（既存 /api/cron/* 2 件が到達していない原因）。
 * データを一切変更せず read のみのため、外部から呼ばれても実害はない。
 */

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 負荷の軽い read: profiles から id を 1 行だけ取得（更新・削除は一切しない）。
    const { error } = await admin.from("profiles").select("id").limit(1);

    if (error) {
      // 失敗時もステータス 200 を返し、cron 実行自体が失敗扱いにならないようにする。
      console.log(`[keepalive] ${timestamp} query error:`, error.message);
      return NextResponse.json({ ok: false, timestamp, error: error.message });
    }

    console.log(`[keepalive] ${timestamp} success`);
    return NextResponse.json({ ok: true, timestamp });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(`[keepalive] ${timestamp} exception:`, message);
    return NextResponse.json({ ok: false, timestamp, error: message });
  }
}
