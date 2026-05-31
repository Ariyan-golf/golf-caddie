"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface RankingRow {
  rank: number;
  display_name: string;
  max_distance_meters: number;
  max_distance_yards: number;
}

export interface EventRankingData {
  event: {
    id: string;
    event_name: string;
    event_type: string;
    hole_number: number | null;
    start_date: string;
    end_date: string;
    created_by: string | null;
    golf_courses: { name: string } | null;
  };
  ranking: RankingRow[];
  myRank: { rank: number; max_distance_meters: number; max_distance_yards: number } | null;
  isParticipant: boolean;
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <>🥇</>;
  if (rank === 2) return <>🥈</>;
  if (rank === 3) return <>🥉</>;
  return <span className="text-sm font-bold text-amber-700">{rank}</span>;
}

export function EventRankingSection({ events }: { events: EventRankingData[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  if (events.length === 0) return null;

  async function handleJoin(eventId: string) {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch("/api/events/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, event_code: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error ?? "参加登録に失敗しました");
      } else {
        setJoiningId(null);
        setCode("");
        router.refresh();
      }
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="space-y-4">
      {events.map(({ event, ranking, myRank, isParticipant }) => {
        const isComp = event.event_type === "comp";
        const isExpanded = expandedId === event.id;
        const displayRows = isExpanded ? ranking : ranking.slice(0, 3);

        return (
          <div key={event.id} className="card border-2 border-amber-300 bg-amber-50">
            {/* ヘッダー */}
            <div className="mb-3">
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  isComp ? "bg-orange-500 text-white" : "bg-amber-400 text-white"
                }`}
              >
                {isComp ? "🏆 コンペ開催中" : "🎯 イベント開催中"}
              </span>
              <h3 className="font-bold text-amber-900 mt-1.5">{event.event_name}</h3>
              {(event.golf_courses?.name || event.hole_number != null) && (
                <p className="text-xs text-amber-600">
                  {[
                    event.golf_courses?.name ?? null,
                    event.hole_number != null ? `${event.hole_number}番ホール` : null,
                  ]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              )}
            </div>

            {/* コンペ参加登録エリア */}
            {isComp && !isParticipant && (
              <div className="mb-3">
                {joiningId === event.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="イベントコードを入力"
                        className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                      />
                      <button
                        onClick={() => handleJoin(event.id)}
                        disabled={joining || !code.trim()}
                        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold"
                      >
                        {joining ? "…" : "参加"}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setJoiningId(null);
                        setJoinError(null);
                        setCode("");
                      }}
                      className="text-xs text-amber-500 underline"
                    >
                      キャンセル
                    </button>
                    {joinError && <p className="text-xs text-red-500 mt-1">{joinError}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => setJoiningId(event.id)}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-xl text-sm font-semibold"
                  >
                    イベントコードで参加登録
                  </button>
                )}
              </div>
            )}

            {isComp && isParticipant && (
              <div className="mb-3">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                  ✓ 参加登録済み
                </span>
              </div>
            )}

            {/* ランキング */}
            {ranking.length === 0 ? (
              <p className="text-sm text-amber-500 text-center py-2">まだ記録がありません</p>
            ) : (
              <>
                <div className="space-y-2">
                  {displayRows.map((row) => (
                    <div
                      key={`${row.rank}-${row.display_name}`}
                      className="flex items-center gap-3 py-1"
                    >
                      <div className="w-8 text-center shrink-0 text-lg">
                        <Medal rank={row.rank} />
                      </div>
                      <span className="flex-1 text-sm font-medium text-amber-900 truncate">
                        {row.display_name}
                      </span>
                      <span className="text-sm font-bold text-amber-800 tabular-nums shrink-0">
                        {row.max_distance_yards}yd
                        <span className="text-xs font-normal text-amber-500 ml-1">
                          ({row.max_distance_meters.toFixed(1)}m)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                {ranking.length > 3 && (
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="mt-2 w-full text-xs text-amber-600 underline"
                  >
                    {isExpanded ? "閉じる" : `もっと見る（全${ranking.length}名）`}
                  </button>
                )}
              </>
            )}

            {/* 自分の順位 */}
            {myRank && (
              <div className="mt-3 pt-3 border-t border-amber-200 text-center">
                <p className="text-xs text-amber-600">
                  あなたの現在順位：
                  <span className="font-bold text-amber-900 ml-1">
                    {myRank.rank}位 / {myRank.max_distance_yards}Y
                  </span>
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
