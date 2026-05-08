// JSTの本日日付（YYYY-MM-DD）を返す。Supabaseのdate型カラムにそのまま入る形式。
export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date()
  );
}

export function hasActiveDayPass(dayPassDate: string | null | undefined): boolean {
  return !!dayPassDate && dayPassDate === todayJST();
}

export function isPremiumPlan(plan: string | null | undefined): boolean {
  return plan === "premium" || plan === "premium_paid";
}

// premiumサブスク or 本日のday_pass を持っているか。
// 1回ごとのround_payments課金は別軸なので呼び出し側で必要に応じて確認する。
export function hasFullAccess(profile: {
  plan?: string | null;
  day_pass_date?: string | null;
}): boolean {
  return isPremiumPlan(profile.plan) || hasActiveDayPass(profile.day_pass_date);
}
