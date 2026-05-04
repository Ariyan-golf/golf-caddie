/**
 * プレミアムユーザー用の紹介コードを生成する
 * 形式: 名前の1文字目 + 6桁の数字  例: 田123456 / A987654
 */
export function generateReferralCode(displayName: string): string {
  const initial = (displayName ?? "").trim().charAt(0) || "U";
  const digits = Math.floor(100000 + Math.random() * 900000).toString();
  return `${initial}${digits}`;
}
