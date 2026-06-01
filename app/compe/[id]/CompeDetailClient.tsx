"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { CompeSettingsClient } from "./CompeSettingsClient";
import { CompeHolesClient, type DraconHole } from "./CompeHolesClient";

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

export function CompeDetailClient({
  compe,
  holes,
}: {
  compe: CompeDetail;
  holes: DraconHole[];
}) {
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

      {/* ── ゴルフ場・開催日の設定（2b） ── */}
      <CompeSettingsClient
        id={compe.id}
        course_id={compe.course_id}
        start_date={compe.start_date}
      />

      {/* ── ドラコン対象ホールの設定（2c） ── */}
      <CompeHolesClient id={compe.id} holes={holes} />
    </div>
  );
}
