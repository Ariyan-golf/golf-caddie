// スコアカード「計」の文字色をパーとの差で決定。未入力(null)は既存色のまま（呼び出し側で未適用）。
export function getScoreColor(total: number | null, par: number): string {
  if (total === null || total === undefined) return "inherit";
  const diff = total - par;
  if (diff <= -2) return "#FFD700"; // イーグル以上：金
  if (diff === -1) return "#E53935"; // バーディー：赤
  if (diff === 0) return "#000000"; // パー：黒
  if (diff === 1) return "#1E88E5"; // ボギー：青
  return "#1A237E"; // ダブルボギー以上：濃い青
}

// スコアカード「結果」列の記号。境界は getScoreColor と同じ「total − par」。
// 未入力(null)は空文字。トリプルボギー以上は「+3」「+4」のように差をそのまま出す。
export function getScoreSymbol(total: number | null, par: number): string {
  if (total === null || total === undefined) return "";
  const diff = total - par;
  if (diff <= -2) return "◎"; // イーグル以上
  if (diff === -1) return "○"; // バーディー
  if (diff === 0) return "－"; // パー
  if (diff === 1) return "△"; // ボギー
  if (diff === 2) return "□"; // ダブルボギー
  return `+${diff}`; // トリプルボギー以上
}
