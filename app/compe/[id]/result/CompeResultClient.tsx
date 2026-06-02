"use client";

import Link from "next/link";
import type { DraconHole } from "../CompeHolesClient";
import { CompeRankingClient } from "../CompeRankingClient";

interface ResultCompe {
  id:         string;
  event_name: string;
  start_date: string;
}

// "YYYY-MM-DD" → "YYYY/MM/DD"（表示用）。
function formatDate(iso: string) {
  return iso.replace(/-/g, "/");
}

// 参加者向け読み取り専用ビュー：コンペ概要＋ランキングのみ（設定・削除は出さない）。
export function CompeResultClient({
  compe,
  holes,
  courseName,
  currentUserId,
}: {
  compe:         ResultCompe;
  holes:         DraconHole[];
  courseName?:   string | null;
  currentUserId: string;
}) {
  return (
    <div className="space-y-6">
      {/* ── ヘッダ ── */}
      <div className="pt-4">
        <Link
          href="/compe"
          className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2"
        >
          ← コンペ一覧へ戻る
        </Link>
        <h1 className="text-2xl font-bold text-green-800">{compe.event_name}</h1>
      </div>

      {/* ── コンペ概要（読み取り専用） ── */}
      <div className="card space-y-2">
        <h2 className="font-semibold text-green-800">📋 コンペ概要</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-green-500 w-20 flex-shrink-0">コンペ名</dt>
            <dd className="text-green-800 font-medium min-w-0">{compe.event_name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-green-500 w-20 flex-shrink-0">ゴルフ場</dt>
            <dd className="text-green-800 min-w-0">{courseName ?? "コース未指定（未登録コース）"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-green-500 w-20 flex-shrink-0">開催日</dt>
            <dd className="text-green-800 min-w-0">{formatDate(compe.start_date)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-green-500 w-20 flex-shrink-0">対象ホール</dt>
            <dd className="text-green-800 min-w-0">
              {holes.length === 0 ? (
                "未設定"
              ) : (
                <ul className="space-y-0.5">
                  {holes.map((h) => (
                    <li key={h.hole_number}>
                      {h.hole_number <= 9 ? "OUT" : "IN"} {h.hole_number}番・
                      {h.mode === "dracon" ? "ドラコン" : "逆ドラコン"}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* ── ランキング（上位3＋あなた＋旗メーター・自己完結） ── */}
      <CompeRankingClient id={compe.id} currentUserId={currentUserId} />
    </div>
  );
}
