// 進行中ラウンドの端末スナップショット（localStorage キー "gca_active_round"）。
//
// iPhone Safari は電池低下・画面スリープ・アプリ切替でページを破棄する。
// その際 React state は消えるため、進行中ラウンドを端末に保存し、
// 起動時に復元して「最初のホールに戻る」事故を防ぐ。
//
// 保存先に localStorage を使う理由：復元は「画面ちらつき無し」で行う必要があり、
// 現在ホール番号や打数を useState 初期化子で同期的に読む。オフライン同期用の
// IndexedDB（lib/offline/db.ts）は Supabase への送信キューで、UI 復元用の状態
// （現在ホール番号など）を持たず読み出しも非同期のため、ここでは流用しない。
// 計測中の「打つ前」地点は別キー（DM_INFLIGHT_KEY, components/HoleRecorder.tsx）が
// 既に永続化・復元しているため、本スナップショットには含めない。

const ACTIVE_ROUND_KEY = "gca_active_round";

// 最終更新からこの時間を超えたスナップショットは復元せず破棄する
// （前回の中断ラウンドを翌日以降に誤って復元しないため）。
const MAX_AGE_MS = 18 * 60 * 60 * 1000; // 18時間

export interface ActiveRoundHole {
  id: string;
  hole_number: number;
  score: number | null;
  putts: number | null;
}

export interface ActiveRoundSnapshot {
  roundId: string;
  courseName: string;
  date: string;
  currentHoleNumber: number;
  holes: ActiveRoundHole[];
  updatedAt: number; // Date.now()（ミリ秒）
}

export function saveActiveRound(snap: ActiveRoundSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_ROUND_KEY, JSON.stringify(snap));
  } catch {
    // quota 超過・プライベートモード等の保存失敗は無視（記録の流れを止めない）。
  }
}

function readRaw(): ActiveRoundSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_ROUND_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as ActiveRoundSnapshot;
    if (!snap || typeof snap.roundId !== "string" || !Array.isArray(snap.holes)) {
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

// 新鮮さ判定込みで取得。古い／壊れている場合は破棄して null を返す。
export function getFreshActiveRound(): ActiveRoundSnapshot | null {
  const snap = readRaw();
  if (!snap) return null;
  if (typeof snap.updatedAt !== "number" || Date.now() - snap.updatedAt > MAX_AGE_MS) {
    clearActiveRound();
    return null;
  }
  return snap;
}

// 指定 roundId のスナップショットだけを取得（別ラウンドなら null）。
// HoleRecorder のマウント時復元で使う。
export function readActiveRound(roundId: string): ActiveRoundSnapshot | null {
  const snap = getFreshActiveRound();
  return snap && snap.roundId === roundId ? snap : null;
}

// 未完了（18ホール全てに score が入っていない）か。自動復帰の判定に使う。
export function isUnfinished(snap: ActiveRoundSnapshot): boolean {
  const completed = snap.holes.filter((h) => h.score !== null).length;
  return !(snap.holes.length >= 18 && completed >= 18);
}

export function clearActiveRound(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_ROUND_KEY);
  } catch {
    // ignore storage failures
  }
}
