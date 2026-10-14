// Beta mode flag — controlled by NEXT_PUBLIC_BETA_MODE env var (default 'true').
// 現在の全機能を無料で提供しているため、課金・利用制限はこのフラグに依存しない
// （'false' にしても全機能が無料のまま使える）。
// 今このフラグで切り替わるのは、プレオープン向けの表示のみ：
//   - ホームの「まもなく正式リリース」お知らせ（app/page.tsx）
//   - ラウンド終了時の「テスト期間中です」完了モーダル（components/HoleRecorder.tsx）
//   - 停止中の削除 cron 2件のスキップ判定（いずれも CLEANUP_SUSPENDED で先に止まる）

export function isBetaMode(): boolean {
  return (process.env.NEXT_PUBLIC_BETA_MODE ?? "true") === "true";
}
