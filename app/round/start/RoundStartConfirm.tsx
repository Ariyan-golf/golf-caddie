"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayJST } from "@/lib/day-pass";
import { startGpsTracking } from "@/lib/gps";
import { acquireWakeLock } from "@/lib/wakeLock";
import { clearActiveRound } from "@/lib/activeRound";

interface CourseTee {
  id: string;
  green_type: string;
  tee_name: string;
  course_rating: number | null;
  slope_rating: number | null;
  distance: number | null;
}

interface Props {
  courseId: string;
  courseName: string;
  courseType: string;
  tee: CourseTee | null;
  outSection: string;
  inSection: string;
}

export function RoundStartConfirm({
  courseId,
  courseName,
  courseType,
  tee,
  outSection,
  inSection,
}: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    setCreating(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(
        `/auth/line?redirect_to=${encodeURIComponent(`/round/start?course_id=${courseId}`)}`
      );
      return;
    }

    const { data, error: err } = await supabase
      .from("rounds")
      .insert({
        user_id:        user.id,
        course_name:    courseName,
        golf_course_id: courseId,
        date:           todayJST(),
        start_hole:     1,
        mode:           "score",
        // 現在の全機能を無料で提供しているため、決済待ち（pending）では作らない。
        payment_status: "paid",
        ...(tee ? {
          course_tee_id: tee.id,
          course_rating: tee.course_rating ?? null,
          slope_rating:  tee.slope_rating ?? null,
        } : {}),
        out_section: outSection || null,
        in_section:  inSection || null,
      })
      .select("id")
      .single();

    if (err || !data) {
      setError("ラウンドの作成に失敗しました。もう一度お試しください。");
      setCreating(false);
      return;
    }

    // 新規ラウンド開始 → 前のラウンドの端末スナップショットを破棄（C）。
    // 残っていると次回起動時に古いラウンドへ誤って自動復帰してしまうため。
    clearActiveRound();
    void startGpsTracking();
    void acquireWakeLock();

    router.push(`/round/${data.id}`);
  }

  const teeLabel = tee
    ? `${tee.green_type} / ${tee.tee_name}` +
      (tee.course_rating != null || tee.slope_rating != null
        ? `（${[
            tee.course_rating != null ? `CR:${tee.course_rating}` : null,
            tee.slope_rating  != null ? `SR:${tee.slope_rating}`  : null,
          ].filter(Boolean).join(" / ")}）`
        : "")
    : null;

  return (
    <div className="space-y-4">
      {/* 自動入力された内容の確認カード */}
      <div className="card space-y-2">
        <p className="text-xs text-green-500 font-medium">以下の内容で開始します</p>
        <dl className="text-sm divide-y divide-green-50">
          <div className="flex justify-between py-2">
            <dt className="text-green-600">ゴルフ場</dt>
            <dd className="font-semibold text-green-800 text-right">{courseName}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-green-600">コース構成</dt>
            <dd className="font-semibold text-green-800 text-right">{courseType}</dd>
          </div>
          {teeLabel ? (
            <div className="flex justify-between py-2">
              <dt className="text-green-600">ティー</dt>
              <dd className="font-semibold text-green-800 text-right">{teeLabel}</dd>
            </div>
          ) : (
            <div className="flex justify-between py-2">
              <dt className="text-green-600">ティー</dt>
              <dd className="text-amber-600 text-right text-xs">未登録</dd>
            </div>
          )}
          {(courseType === "27H" || courseType === "36H") && (outSection || inSection) && (
            <div className="flex justify-between py-2">
              <dt className="text-green-600">セクション</dt>
              <dd className="font-semibold text-green-800 text-right">
                {courseType === "27H"
                  ? `${outSection || "—"}コース → ${inSection || "—"}コース`
                  : `${outSection || "—"}コース`}
              </dd>
            </div>
          )}
          <div className="flex justify-between py-2">
            <dt className="text-green-600">スタート</dt>
            <dd className="font-semibold text-green-800 text-right">1番（OUT）</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-green-600">記録モード</dt>
            <dd className="font-semibold text-green-800 text-right">スコア記録</dd>
          </div>
        </dl>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={creating}
        className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:bg-green-800
                   text-white text-base font-bold transition-colors shadow-md disabled:opacity-60"
      >
        {creating ? "作成中..." : "ラウンド開始"}
      </button>

      <p className="text-center text-xs text-green-500">
        ティーや記録モードは、ラウンド開始後に変更できます
      </p>
    </div>
  );
}
