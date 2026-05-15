// JSTの本日日付（YYYY-MM-DD）を返す。Supabaseのdate型カラムにそのまま入る形式。
export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date()
  );
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
