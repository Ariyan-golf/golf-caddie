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

export function CompeRankingClient({ id }: { id: string }) {
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

  useEffect(() => {
    load();
  }, [load]);

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
          上の「ドラコン対象ホール」で設定してください。
        </p>
      ) : (
        <div className="space-y-4">
          {holes.map((hole) => {
            const records = filterRecords(hole.records);
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

                {records.length === 0 ? (
                  <p className="text-xs text-green-400 text-center py-3">
                    まだ記録がありません
                  </p>
                ) : (
                  <div className="space-y-1">
                    {records.map((r, i) => {
                      const rank = i + 1;
                      return (
                        <div
                          key={r.user_id}
                          className={`flex items-center gap-3 py-1.5 border-b border-green-50 last:border-0 ${
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
                          </p>
                          <p className="text-right flex-shrink-0 text-lg font-bold text-amber-800 tabular-nums">
                            {r.distance_yards}
                            <span className="text-xs font-normal text-amber-500 ml-0.5">y</span>
                          </p>
                        </div>
                      );
                    })}
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
