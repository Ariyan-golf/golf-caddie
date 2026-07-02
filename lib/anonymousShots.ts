import { createClient } from "@/lib/supabase/client";

/**
 * /try（登録不要のソロ飛距離計測）の匿名ショット保存。
 *
 * - 端末ごとの緩い識別子 device_id（localStorage 保持の UUID）を付けて
 *   public.anonymous_shots へ INSERT する（RLS は INSERT only・anon 可）。
 * - 保存は fire-and-forget。失敗しても計測 UX には一切影響させない
 *   （例外・DBエラーは console.warn に留める）。
 * - クライアントからは読み返せない書き込み専用テーブル前提のため、
 *   ここでは INSERT しか行わない。
 */

const DEVICE_ID_KEY = "golf_caddie_try_device_id";

/**
 * 端末IDを返す。localStorage にあれば再利用、無ければ生成して保存。
 * localStorage が使えない環境（プライベートブラウズ等）では毎回新規生成する。
 */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    // localStorage 不可時は永続化できないが、識別子だけは返す。
    return crypto.randomUUID();
  }
}

export interface AnonymousShotParams {
  club: string | null;
  distanceMeters: number;
  distanceYards: number;
  start?: { latitude: number; longitude: number; accuracy?: number | null } | null;
  end?: { latitude: number; longitude: number; accuracy?: number | null } | null;
  clubInputAt: "当日" | "事後";
  measuredAt: string; // ISO 8601
}

/**
 * 匿名ショット1件を保存する（fire-and-forget）。
 * 呼び出し側は await 不要。失敗しても例外は投げない。
 */
export function saveAnonymousShot(params: AnonymousShotParams): void {
  try {
    const { club, distanceMeters, distanceYards, start, end, clubInputAt, measuredAt } = params;
    const supabase = createClient();
    supabase
      .from("anonymous_shots")
      .insert({
        device_id: getDeviceId(),
        club,
        distance_meters: distanceMeters,
        distance_yards: distanceYards,
        start_lat: start?.latitude ?? null,
        start_lng: start?.longitude ?? null,
        end_lat: end?.latitude ?? null,
        end_lng: end?.longitude ?? null,
        accuracy_start: start?.accuracy ?? null,
        accuracy_end: end?.accuracy ?? null,
        club_input_at: clubInputAt,
        measured_at: measuredAt,
      })
      .then(({ error }) => {
        if (error) console.warn("anonymous shot save failed", error);
      });
  } catch (err) {
    // getDeviceId / createClient 等の同期例外もここで握り潰す。
    console.warn("anonymous shot save failed", err);
  }
}
