// JSTの本日日付（YYYY-MM-DD）を返す。Supabaseのdate型カラムにそのまま入る形式。
export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date()
  );
}

// YYYY-MM-DD を「その日の日本時間 0:00」の ISO 文字列にする（timestamptz 比較用）。
// 例: "2026-10-01" → "2026-10-01T00:00:00+09:00"
export function jstDayStartISO(date: string): string {
  return `${date}T00:00:00+09:00`;
}

// YYYY-MM-DD に日数を足した YYYY-MM-DD を返す。UTC で計算するので実行環境の
// タイムゾーンに左右されない（月末・年末の繰り上がりも Date.UTC が処理する）。
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function hasActiveDayPass(dayPassDate: string | null | undefined): boolean {
  return !!dayPassDate && dayPassDate === todayJST();
}

// v4: 月額330円サブスク会員かどうかの判定。
// premiumキーは内部識別子として温存（実体は v4 の月額サブスク会員）。
// 旧 standard プランの既存ユーザーもサブスク会員として扱う（マイグレーション完了まで）。
export function isSubscriber(plan: string | null | undefined): boolean {
  return plan === "premium" || plan === "premium_paid" || plan === "standard";
}

// サブスク会員 or 本日のday_pass を持っているか。
// 1回ごとのround_payments課金は別軸なので呼び出し側で必要に応じて確認する。
export function hasFullAccess(profile: {
  plan?: string | null;
  day_pass_date?: string | null;
}): boolean {
  return isSubscriber(profile.plan) || hasActiveDayPass(profile.day_pass_date);
}
