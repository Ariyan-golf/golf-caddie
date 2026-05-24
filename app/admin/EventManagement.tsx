"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TobashikkoRankingRow } from "@/lib/tobashikko/ranking";

interface GolfCourse {
  id: string;
  name: string;
}

interface Event {
  id: string;
  event_name: string;
  course_id: string;
  hole_number: number;
  event_type: string;
  event_code: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  golf_courses: { name: string } | null;
}

interface RankingRow {
  rank: number;
  display_name: string;
  max_distance_meters: number;
  max_distance_yards: number;
  recorded_at: string;
}

interface RankingEvent {
  id: string;
  event_name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  hole_number: number;
  golf_courses: { name: string } | null;
}

type SortOrder = "distance" | "date";

function formatDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function EventManagement({
  courses,
  initialEvents,
}: {
  courses: GolfCourse[];
  initialEvents: Event[];
}) {
  const router = useRouter();

  // フォーム状態
  const [eventName,  setEventName]  = useState("");
  const [courseId,   setCourseId]   = useState(courses[0]?.id ?? "");
  const [holeNum,    setHoleNum]    = useState(1);
  const [eventType,  setEventType]  = useState<"monthly" | "comp" | "tobashikko">("monthly");
  const [eventCode,  setEventCode]  = useState("");
  const [startDate,  setStartDate]  = useState("");
  const [endDate,    setEndDate]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  // ランキングモーダル状態
  const [rankingEvent,       setRankingEvent]       = useState<RankingEvent | null>(null);
  const [rankingType,        setRankingType]        = useState<"default" | "tobashikko">("default");
  const [ranking,            setRanking]            = useState<RankingRow[]>([]);
  const [tobashikkoRanking,  setTobashikkoRanking]  = useState<TobashikkoRankingRow[]>([]);
  const [rankingLoading,     setRankingLoading]     = useState(false);
  const [rankingError,       setRankingError]       = useState<string | null>(null);
  const [sortOrder,          setSortOrder]          = useState<SortOrder>("distance");

  // 削除中のID管理
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 現在の並び順に応じたランキング（default 用・shot_distances ベース）
  const sortedRanking: RankingRow[] =
    sortOrder === "distance"
      ? [...ranking].sort((a, b) => b.max_distance_meters - a.max_distance_meters)
      : [...ranking].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  // 並び順に応じた飛ばしっこGOランキング
  const sortedTobashikko: TobashikkoRankingRow[] =
    sortOrder === "distance"
      ? [...tobashikkoRanking].sort((a, b) => b.distance_yards - a.distance_yards)
      : [...tobashikkoRanking].sort((a, b) => (a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : 0));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    // 飛ばしっこGOは course/hole 不要・コードは開始日(YYYY-MM-DD)から自動生成。
    let payload: Record<string, unknown>;
    if (eventType === "tobashikko") {
      const [y, m] = (startDate || "").split("-");
      payload = {
        event_name:  eventName,
        course_id:   null,
        hole_number: 1,            // CHECK制約(1〜18)を満たすためのダミー値・集計では使わない
        start_date:  startDate,
        end_date:    endDate,
        event_type:  "tobashikko",
        event_code:  y && m ? `TOBASHIKKO_${y}_${m}` : "",
      };
    } else {
      payload = {
        event_name:  eventName,
        course_id:   courseId,
        hole_number: holeNum,
        start_date:  startDate,
        end_date:    eventType === "comp" ? startDate : endDate,
        event_type:  eventType,
        event_code:  eventType === "comp" ? eventCode : undefined,
      };
    }

    const res = await fetch("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setFormError(data.error ?? "登録に失敗しました");
    } else {
      setEventName("");
      setEventCode("");
      setStartDate("");
      setEndDate("");
      router.refresh();
    }
    setSubmitting(false);
  }

  async function handleDelete(eventId: string) {
    if (!confirm("このイベントを削除しますか？")) return;
    setDeletingId(eventId);
    await fetch("/api/admin/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    setDeletingId(null);
    router.refresh();
  }

  async function handleShowRanking(ev: Event) {
    setRankingEvent(ev);
    setRanking([]);
    setTobashikkoRanking([]);
    setRankingType(ev.event_type === "tobashikko" ? "tobashikko" : "default");
    setRankingError(null);
    setRankingLoading(true);
    setSortOrder("distance");

    const res = await fetch(`/api/admin/events/${ev.id}/ranking`);
    const data = await res.json();

    if (!res.ok) {
      setRankingError(data.error ?? "取得に失敗しました");
    } else if (data.type === "tobashikko") {
      setRankingType("tobashikko");
      setTobashikkoRanking(data.ranking ?? []);
    } else {
      setRankingType("default");
      setRanking(data.ranking ?? []);
    }
    setRankingLoading(false);
  }

  function handleCsvDownload() {
    if (!rankingEvent) return;

    let header = "";
    let body   = "";
    let filename = `event_ranking_${rankingEvent.id}.csv`;

    if (rankingType === "tobashikko") {
      if (sortedTobashikko.length === 0) return;
      header = "順位,ニックネーム,飛距離(yd),飛距離(m),使用ドライバー,ゴルフ場,ラウンド日\n";
      body = sortedTobashikko
        .map((r) =>
          [
            r.rank,
            `"${r.nickname}"`,
            r.distance_yards,
            r.distance_meters != null ? r.distance_meters.toFixed(1) : "",
            `"${r.driver_text ?? ""}"`,
            `"${r.course_name}"`,
            new Date(r.round_date).toLocaleDateString("ja-JP"),
          ].join(",")
        )
        .join("\n");
      filename = `tobashikko_ranking_${rankingEvent.id}.csv`;
    } else {
      if (sortedRanking.length === 0) return;
      header = "順位(飛距離),名前,最長飛距離(yd),最長飛距離(m),記録日時\n";
      body = sortedRanking
        .map((r) =>
          [
            r.rank,
            `"${r.display_name}"`,
            r.max_distance_yards,
            r.max_distance_meters.toFixed(1),
            `"${formatDatetime(r.recorded_at)}"`,
          ].join(",")
        )
        .join("\n");
    }

    const bom = "﻿";
    const blob = new Blob([bom + header + body], { type: "text/csv; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* ── 新規イベント登録フォーム ── */}
      <div className="bg-white border border-green-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-green-700 mb-3">新規イベント登録</p>
        <form onSubmit={handleCreate} className="space-y-3">
          {/* イベントタイプ */}
          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">イベントタイプ *</label>
            <div className="flex gap-3">
              {(["monthly", "comp", "tobashikko"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="eventType"
                    value={t}
                    checked={eventType === t}
                    onChange={() => { setEventType(t); setEventCode(""); }}
                    className="accent-green-600"
                  />
                  <span className="text-green-700">
                    {t === "monthly"   ? "月間イベント" :
                     t === "comp"      ? "コンペイベント（当日限定）" :
                                         "飛ばしっこGO（全国）"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">イベント名 *</label>
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder={
                eventType === "comp"       ? "〇〇カップ ドラコン" :
                eventType === "tobashikko" ? "飛ばしっこGO 2026年8月度" :
                                             "春の飛距離コンテスト"
              }
              required
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* コンペ用イベントコード */}
          {eventType === "comp" && (
            <div>
              <label className="text-xs text-green-600 font-medium block mb-1">
                イベントコード * <span className="text-green-400 font-normal">（参加者に共有する合言葉）</span>
              </label>
              <input
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                placeholder="例: DRACON240507"
                required={eventType === "comp"}
                className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 font-mono tracking-wider"
              />
            </div>
          )}

          {/* 飛ばしっこGO は全国対象なのでゴルフ場・ホール番号入力不要 */}
          {eventType !== "tobashikko" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-green-600 font-medium block mb-1">ゴルフ場 *</label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  required
                  className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                >
                  {courses.length === 0 && (
                    <option value="">ゴルフ場がありません</option>
                  )}
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-green-600 font-medium block mb-1">対象ホール番号 *</label>
                <input
                  type="number"
                  min={1}
                  max={18}
                  value={holeNum}
                  onChange={(e) => setHoleNum(Number(e.target.value))}
                  required
                  className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            </div>
          )}

          {eventType === "comp" ? (
            <div>
              <label className="text-xs text-green-600 font-medium block mb-1">
                開催日 * <span className="text-green-400 font-normal">（当日のみ有効）</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setEndDate(e.target.value); }}
                required
                className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-green-600 font-medium block mb-1">開始日 *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
              <div>
                <label className="text-xs text-green-600 font-medium block mb-1">終了日 *</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            </div>
          )}

          {formError && (
            <p className="text-xs text-red-500">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting || (eventType !== "tobashikko" && courses.length === 0)}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
          >
            {submitting ? "登録中…" : "イベントを登録"}
          </button>
        </form>
      </div>

      {/* ── イベント一覧 ── */}
      <div className="bg-white border border-green-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-green-100 text-green-600 text-xs">
              <th className="text-left px-4 py-3 font-semibold">イベント名</th>
              <th className="text-left px-4 py-3 font-semibold">ゴルフ場</th>
              <th className="text-center px-4 py-3 font-semibold">H</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">種別</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">開始日</th>
              <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">終了日</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {initialEvents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-green-400 text-sm">
                  イベントがありません
                </td>
              </tr>
            ) : (
              initialEvents.map((ev) => (
                <tr key={ev.id} className="border-b border-green-50 last:border-0 hover:bg-green-50/50">
                  <td className="px-4 py-3 font-medium text-green-900">
                    {ev.event_name}
                    {ev.event_type === "comp" && ev.event_code && (
                      <span className="ml-1 text-xs font-mono text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
                        {ev.event_code}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-green-700 text-xs">{ev.golf_courses?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-center text-green-700">
                    {ev.event_type === "tobashikko" ? "—" : ev.hole_number}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {ev.event_type === "comp" ? (
                      <span className="bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold text-xs">
                        コンペ
                      </span>
                    ) : ev.event_type === "tobashikko" ? (
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold text-xs whitespace-nowrap">
                        飛ばしっこGO
                      </span>
                    ) : (
                      <span className="bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-semibold text-xs">
                        月間
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-green-500 text-xs whitespace-nowrap">
                    {new Date(ev.start_date).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-green-500 text-xs whitespace-nowrap">
                    {new Date(ev.end_date).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => handleShowRanking(ev)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      結果を見る
                    </button>
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deletingId === ev.id}
                      className="text-xs text-red-400 hover:underline disabled:opacity-40"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── ランキングモーダル ── */}
      {rankingEvent && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setRankingEvent(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="p-4 border-b border-green-100 flex-shrink-0 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-green-900">{rankingEvent.event_name}</p>
                  <p className="text-xs text-green-500 mt-0.5">
                    {rankingType === "tobashikko"
                      ? "全国（全ホール対象）"
                      : `${rankingEvent.golf_courses?.name ?? "—"} / ${rankingEvent.hole_number}番ホール`}
                    {" ／ "}
                    {new Date(rankingEvent.start_date).toLocaleDateString("ja-JP")} 〜{" "}
                    {new Date(rankingEvent.end_date).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <button
                  onClick={() => setRankingEvent(null)}
                  className="text-green-400 hover:text-green-700 text-lg leading-none ml-4"
                >
                  ✕
                </button>
              </div>

              {/* 並び替えボタン */}
              {!rankingLoading && (rankingType === "tobashikko" ? tobashikkoRanking.length : ranking.length) > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setSortOrder("distance")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                      sortOrder === "distance"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >
                    飛距離順
                  </button>
                  <button
                    onClick={() => setSortOrder("date")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                      sortOrder === "date"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-white text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >
                    日付順
                  </button>
                  <button
                    onClick={handleCsvDownload}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold border bg-white text-green-600 border-green-200 hover:bg-green-50 transition-colors"
                  >
                    CSVダウンロード
                  </button>
                </div>
              )}
            </div>

            {/* ランキング本体 */}
            <div className="overflow-y-auto flex-1">
              {rankingLoading ? (
                <div className="py-12 text-center text-green-400 text-sm">読み込み中…</div>
              ) : rankingError ? (
                <div className="py-8 text-center text-red-400 text-sm">{rankingError}</div>
              ) : rankingType === "tobashikko" ? (
                sortedTobashikko.length === 0 ? (
                  <div className="py-12 text-center text-green-400 text-sm">
                    <p className="text-2xl mb-2">🏌️</p>
                    <p>期間内のエントリーがありません</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b border-green-100">
                      <tr className="text-green-600 text-xs">
                        <th className="text-center px-3 py-3 font-semibold w-10">順位</th>
                        <th className="text-left px-3 py-3 font-semibold">ニックネーム</th>
                        <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">飛距離</th>
                        <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">使用ドライバー</th>
                        <th className="text-left px-3 py-3 font-semibold whitespace-nowrap">ゴルフ場 / ラウンド日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTobashikko.map((row, i) => {
                        const displayRank = sortOrder === "distance" ? row.rank : i + 1;
                        const isTop3ByDistance = row.rank <= 3 && sortOrder === "distance";
                        return (
                          <tr
                            key={`${row.rank}-${row.nickname}-${row.round_date}`}
                            className={`border-b border-green-50 last:border-0 ${
                              isTop3ByDistance && row.rank === 1
                                ? "bg-yellow-50"
                                : isTop3ByDistance && row.rank === 2
                                ? "bg-gray-50"
                                : isTop3ByDistance && row.rank === 3
                                ? "bg-orange-50"
                                : ""
                            }`}
                          >
                            <td className="px-3 py-3 text-center font-bold text-green-800">
                              {sortOrder === "distance" && row.rank === 1 ? "🥇"
                                : sortOrder === "distance" && row.rank === 2 ? "🥈"
                                : sortOrder === "distance" && row.rank === 3 ? "🥉"
                                : displayRank}
                            </td>
                            <td className="px-3 py-3 font-medium text-green-900">{row.nickname}</td>
                            <td className="px-3 py-3 text-right tabular-nums font-semibold text-green-800 whitespace-nowrap">
                              {row.distance_yards} yd
                              {row.distance_meters != null && (
                                <span className="text-green-400 font-normal ml-1 text-xs">
                                  ({row.distance_meters.toFixed(1)} m)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-green-700 text-xs whitespace-nowrap">
                              {row.driver_text ?? "—"}
                            </td>
                            <td className="px-3 py-3 text-green-500 text-xs whitespace-nowrap">
                              {row.course_name}
                              <span className="text-green-400 ml-1">
                                {new Date(row.round_date).toLocaleDateString("ja-JP")}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              ) : sortedRanking.length === 0 ? (
                <div className="py-12 text-center text-green-400 text-sm">
                  <p className="text-2xl mb-2">🏌️</p>
                  <p>期間内のデータがありません</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b border-green-100">
                    <tr className="text-green-600 text-xs">
                      <th className="text-center px-3 py-3 font-semibold w-10">順位</th>
                      <th className="text-left px-3 py-3 font-semibold">名前</th>
                      <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">最長飛距離</th>
                      <th className="text-right px-3 py-3 font-semibold whitespace-nowrap">記録日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRanking.map((row, i) => {
                      const displayRank = sortOrder === "distance" ? row.rank : i + 1;
                      const isTop3ByDistance = row.rank <= 3 && sortOrder === "distance";
                      return (
                        <tr
                          key={`${row.display_name}-${row.recorded_at}`}
                          className={`border-b border-green-50 last:border-0 ${
                            isTop3ByDistance && row.rank === 1
                              ? "bg-yellow-50"
                              : isTop3ByDistance && row.rank === 2
                              ? "bg-gray-50"
                              : isTop3ByDistance && row.rank === 3
                              ? "bg-orange-50"
                              : ""
                          }`}
                        >
                          <td className="px-3 py-3 text-center font-bold text-green-800">
                            {sortOrder === "distance" && row.rank === 1 ? "🥇"
                              : sortOrder === "distance" && row.rank === 2 ? "🥈"
                              : sortOrder === "distance" && row.rank === 3 ? "🥉"
                              : displayRank}
                          </td>
                          <td className="px-3 py-3 font-medium text-green-900">{row.display_name}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-semibold text-green-800 whitespace-nowrap">
                            {row.max_distance_yards} yd
                            <span className="text-green-400 font-normal ml-1 text-xs">
                              ({row.max_distance_meters.toFixed(1)} m)
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right text-green-500 text-xs whitespace-nowrap">
                            {formatDatetime(row.recorded_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
