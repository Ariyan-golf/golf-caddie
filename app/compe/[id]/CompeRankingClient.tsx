"use client";

import { useCallback, useEffect, useState } from "react";

type Mode = "dracon" | "reverse";

interface RankingRecord {
  user_id:        string;
  display_name:   string;
  gender:         string | null;
  age_group:      string | null;
  distance_yards: number;
}

interface HoleRanking {
  hole_number: number;
  mode:        Mode;
  records:     RankingRecord[];
}

// ── タブ定義（クライアント側フィルタ。tobashikko ランキングと同じ区分） ──
const GENDER_TABS = [
  { key: "all",    label: "全体" },
  { key: "male",   label: "男性" },
  { key: "female", label: "女性" },
] as const;

const AGE_TABS = [
  { key: "all",    label: "全年代" },
  { key: "20s",    label: "20代" },
  { key: "30s",    label: "30代" },
  { key: "40s",    label: "40代" },
  { key: "50s",    label: "50代" },
  { key: "60plus", label: "60代〜" },
] as const;

// 1〜3位はメダル、それ以外は数字（tobashikko ランキングの Medal を流用）。
function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-sm font-bold text-green-700">{rank}</span>;
}

// クライアント側フィルタ用のピルタブ（tobashikko の FilterTabs と同じ配色）。
function FilterTabs({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs:      ReadonlyArray<{ key: string; label: string }>;
  activeKey: string;
  onSelect:  (key: string) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              isActive
                ? "bg-green-700 text-white"
                : "bg-green-50 text-green-700 border border-green-200"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

const MODE_LABEL: Record<Mode, string> = {
  dracon:  "ドラコン",
  reverse: "逆ドラコン（最短）",
};

// 距離 → メーター充填率(0〜100)。dracon は大きいほど満ち、reverse は小さいほど満ちる。
// fullValue は 1位の距離（dracon=最大 / reverse=最短）。0除算・範囲外はクランプ。
function pctOf(mode: Mode, v: number, fullValue: number): number {
  if (!fullValue || !v) return 0;
  const raw = mode === "dracon" ? (v / fullValue) * 100 : (fullValue / v) * 100;
  return Math.max(0, Math.min(100, raw));
}

// 「あなた」メーター（旗ライン付き）＋距離カウントアップ。表示演出のみ。
function HoleMeter({
  mode,
  me,
  myRank,
  border,
  fullValue,
  showFlag,
  animKey,
}: {
  mode:      Mode;
  me:        RankingRecord | undefined;
  myRank:    number;
  border:    number | undefined;
  fullValue: number | undefined;
  showFlag:  boolean;
  animKey:   string;
}) {
  // 距離を 0→実測値へカウントアップ（ease-out / 約700ms）。
  const target = me?.distance_yards ?? 0;
  const [animatedYards, setAnimatedYards] = useState(0);
  useEffect(() => {
    let raf = 0;
    let startTs = 0;
    const duration = 700;
    const step = (ts: number) => {
      if (!startTs) startTs = ts;
      const t = Math.min(1, (ts - startTs) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setAnimatedYards(Math.round(target * eased));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setAnimatedYards(target); // 最終値は必ず実測値で確定
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, animKey]);

  const mePct   = me && fullValue ? pctOf(mode, me.distance_yards, fullValue) : 0;
  const flagPct =
    showFlag && border != null && fullValue ? pctOf(mode, border, fullValue) : null;

  // 状況テキスト（数字はカウントアップで別表示するため、ここには含めない）。
  let statusText: string;
  if (!me) {
    statusText = "記録なし";
  } else if (myRank <= 3) {
    statusText = `（${myRank}位）・ランクイン中！`;
  } else {
    const gap =
      border == null
        ? null
        : mode === "dracon"
        ? border - me.distance_yards
        : me.distance_yards - border;
    const gapText =
      gap != null && gap > 0
        ? `3位まであと${gap}y${mode === "reverse" ? "（短く）" : ""}`
        : "あと—y";
    statusText = `（${myRank}位）・${gapText}`;
  }

  return (
    <div className="pt-1.5 mt-1 border-t border-green-100 space-y-1">
      {/* メーター（トラック＋自分のバー＋3位の旗ライン） */}
      <div className="relative">
        <div className="h-2 bg-green-100 rounded-full overflow-hidden">
          {me && (
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${mePct}%` }}
            />
          )}
        </div>
        {flagPct != null && (
          <div
            className="absolute -top-0.5 h-3 w-0.5 bg-amber-500 -translate-x-1/2"
            style={{ left: `${flagPct}%` }}
            aria-hidden
          />
        )}
      </div>

      {showFlag && border != null && (
        <p className="text-[10px] text-amber-600">🚩 3位ライン {border}y</p>
      )}

      <p className="text-sm font-semibold text-green-700">
        {me ? (
          <>
            あなた：<span className="tabular-nums">{animatedYards}</span>y {statusText}
          </>
        ) : (
          "あなた：記録なし"
        )}
      </p>
    </div>
  );
}

export function CompeRankingClient({
  id,
  refreshKey,
  currentUserId,
}: {
  id: string;
  refreshKey?: number;
  currentUserId: string;
}) {
  const [holes, setHoles]     = useState<HoleRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [loaded, setLoaded]   = useState(false);

  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter]       = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compe/${id}/ranking`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "ランキングの取得に失敗しました");
        return;
      }
      setHoles(Array.isArray(data.holes) ? (data.holes as HoleRanking[]) : []);
      setLoaded(true);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // 初回マウント時と refreshKey 変化時（設定保存後）に再取得する。
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey]);

  // サーバ順（mode 順にソート済み）を保持したままフィルタする。
  function filterRecords(records: RankingRecord[]): RankingRecord[] {
    return records.filter(
      (r) =>
        (genderFilter === "all" || r.gender === genderFilter) &&
        (ageFilter === "all" || r.age_group === ageFilter)
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-green-800">🏆 ランキング</h2>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-green-600 hover:text-green-700 hover:underline disabled:opacity-50 flex-shrink-0"
        >
          {loading ? "更新中..." : "更新"}
        </button>
      </div>

      {/* 性別タブ */}
      <FilterTabs tabs={GENDER_TABS} activeKey={genderFilter} onSelect={setGenderFilter} />
      {/* 年代タブ */}
      <FilterTabs tabs={AGE_TABS} activeKey={ageFilter} onSelect={setAgeFilter} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {loading && !loaded ? (
        <p className="text-sm text-green-400 text-center py-4">読み込み中...</p>
      ) : !error && holes.length === 0 ? (
        <p className="text-sm text-green-400 text-center py-4">
          対象ホールが未設定です。
          <br />
          下の「ドラコン対象ホール」で設定してください。
        </p>
      ) : (
        <div className="space-y-4">
          {holes.map((hole) => {
            // サーバ順（モード別ソート済み）を保持したフィルタ後配列。
            const sorted = filterRecords(hole.records);
            const top3 = sorted.slice(0, 3);
            // 3位の距離（=越えるべきボーダー）。3人未満なら末尾の距離。空なら未定義。
            const border =
              sorted.length >= 3 ? sorted[2].distance_yards : sorted[sorted.length - 1]?.distance_yards;
            const myIndex = sorted.findIndex((r) => r.user_id === currentUserId);
            const me = myIndex >= 0 ? sorted[myIndex] : undefined;
            const myRank = myIndex + 1;
            // メーター満タン基準＝1位の距離（dracon=最大 / reverse=最短）。
            const fullValue = sorted[0]?.distance_yards;
            // 3人以上いるときだけ「3位ライン」を表示（未満は全員ランクイン中扱い）。
            const showFlag = sorted.length >= 3;

            return (
              <div key={hole.hole_number} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-green-800">{hole.hole_number}番ホール</h3>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      hole.mode === "dracon"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-sky-100 text-sky-700"
                    }`}
                  >
                    {MODE_LABEL[hole.mode]}
                  </span>
                </div>

                {sorted.length === 0 ? (
                  <p className="text-xs text-green-400 text-center py-3">
                    まだ記録がありません
                  </p>
                ) : (
                  <div className="space-y-1">
                    {/* 上位3名（越えるべき旗） */}
                    {top3.map((r, i) => {
                      const rank = i + 1;
                      const isMe = r.user_id === currentUserId;
                      return (
                        <div
                          key={r.user_id}
                          className={`flex items-center gap-3 py-1.5 border-b border-green-50 last:border-0 ${
                            isMe ? "bg-green-50 ring-1 ring-green-300 -mx-2 px-2 rounded" :
                            rank === 1 ? "bg-yellow-50/40 -mx-2 px-2 rounded" :
                            rank === 2 ? "bg-gray-50/60  -mx-2 px-2 rounded" :
                            rank === 3 ? "bg-orange-50/40 -mx-2 px-2 rounded" : ""
                          }`}
                        >
                          <div className="w-8 text-center flex-shrink-0">
                            <Medal rank={rank} />
                          </div>
                          <p className="flex-1 min-w-0 font-semibold text-green-900 truncate">
                            {r.display_name}
                            {isMe && (
                              <span className="text-xs font-normal text-green-500 ml-1">（あなた）</span>
                            )}
                          </p>
                          <p className="text-right flex-shrink-0 text-lg font-bold text-amber-800 tabular-nums">
                            {r.distance_yards}
                            <span className="text-xs font-normal text-amber-500 ml-0.5">y</span>
                          </p>
                        </div>
                      );
                    })}

                    {/* あなた：メーター＋旗ライン＋距離カウントアップ（上位3の下に常に1行） */}
                    <HoleMeter
                      mode={hole.mode}
                      me={me}
                      myRank={myRank}
                      border={border}
                      fullValue={fullValue}
                      showFlag={showFlag}
                      animKey={`${refreshKey ?? 0}-${genderFilter}-${ageFilter}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
