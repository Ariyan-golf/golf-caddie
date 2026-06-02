"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CompeSettingsClient } from "./CompeSettingsClient";
import { CompeHolesClient, type DraconHole } from "./CompeHolesClient";
import { CompeRankingClient } from "./CompeRankingClient";

export interface CompeDetail {
  id:         string;
  event_name: string;
  event_code: string | null;
  start_date: string;
  end_date:   string;
  course_id:  string | null;
}

// 参加リンク用 URL。ドメインはハードコードせず実行中オリジンから組み立てる。
function joinUrl(origin: string, code: string) {
  return `${origin}/compe/join?code=${encodeURIComponent(code)}`;
}

// "YYYY-MM-DD" → "YYYY/MM/DD"（表示用）。
function formatDate(iso: string) {
  return iso.replace(/-/g, "/");
}

export function CompeDetailClient({
  compe,
  holes: initialHoles,
  courseName: initialCourseName,
  currentUserId,
}: {
  compe: CompeDetail;
  holes: DraconHole[];
  courseName?: string | null;
  currentUserId: string;
}) {
  // 概要カード・ランキングは保存操作で即更新できるよう親で state を持つ。
  const [holes, setHoles] = useState<DraconHole[]>(initialHoles);
  const [courseName, setCourseName] = useState<string | null>(initialCourseName ?? null);
  const [startDate, setStartDate] = useState<string>(compe.start_date);
  const [refreshKey, setRefreshKey] = useState(0);

  // 対象ホール保存後：概要カードを更新しランキングを再取得。
  function handleHolesSaved(newHoles: DraconHole[]) {
    setHoles(newHoles);
    setRefreshKey((k) => k + 1);
  }

  // ゴルフ場・開催日保存後：概要カードを更新しランキングを再取得。
  function handleSettingsSaved({ courseName, date }: { courseName: string | null; date: string }) {
    setCourseName(courseName);
    setStartDate(date);
    setRefreshKey((k) => k + 1);
  }

  // QRに埋め込むオリジン。SSR では window が無いのでマウント後に取得する。
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

      {/* ── コンペ概要 ── */}
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
            <dd className="text-green-800 min-w-0">{formatDate(startDate)}</dd>
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

      {/* ── 参加コード（共有用） ── */}
      <div className="card bg-green-50 border-green-300 space-y-2 text-center">
        <p className="text-sm font-semibold text-green-700">参加コード</p>
        <p className="text-xs text-green-600">参加者にこの参加コードまたはQRを共有してください</p>
        <p className="text-4xl font-bold tracking-[0.3em] text-green-800 tabular-nums py-2">
          {compe.event_code ?? "—"}
        </p>
        {origin && compe.event_code && (
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <div className="bg-white p-2 rounded-xl border border-green-200">
              <QRCodeSVG value={joinUrl(origin, compe.event_code)} size={140} />
            </div>
            <p className="text-xs text-green-500">QRを読み取ると参加ページが開きます</p>
          </div>
        )}
      </div>

      {/* ── ランキング表示（3b） ── */}
      <CompeRankingClient id={compe.id} refreshKey={refreshKey} currentUserId={currentUserId} />

      {/* ── ゴルフ場・開催日の設定（2b） ── */}
      <CompeSettingsClient
        id={compe.id}
        course_id={compe.course_id}
        start_date={compe.start_date}
        onSaved={handleSettingsSaved}
      />

      {/* ── ドラコン対象ホールの設定（2c） ── */}
      <CompeHolesClient id={compe.id} holes={initialHoles} onSaved={handleHolesSaved} />
    </div>
  );
}
