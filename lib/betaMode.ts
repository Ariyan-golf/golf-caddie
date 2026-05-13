// Beta mode flag — when ON, billing UI is hidden and pending-round cleanup
// cron is skipped. Controlled by NEXT_PUBLIC_BETA_MODE env var (default 'true').
// Set NEXT_PUBLIC_BETA_MODE='false' at official launch to re-enable billing.

export function isBetaMode(): boolean {
  return (process.env.NEXT_PUBLIC_BETA_MODE ?? "true") === "true";
}
