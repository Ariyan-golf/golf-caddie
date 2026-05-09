"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayJST } from "@/lib/day-pass";

interface Props {
  courseId: string;
  courseName: string;
}

export function RoundStartConfirm({ courseId, courseName }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    setCreating(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
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
        payment_status: "pending",
      })
      .select("id")
      .single();

    if (err || !data) {
      setError("ラウンドの作成に失敗しました。もう一度お試しください。");
      setCreating(false);
      return;
    }

    router.push(`/round/${data.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 border-2 border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">💳</span>
          <div className="space-y-2">
            <p className="font-semibold text-amber-900 text-sm">本日中の課金が必要です</p>
            <p className="text-amber-800 text-sm leading-relaxed">
              ラウンド終了後、<strong>本日23:59まで</strong>に決済を完了してください。
              未課金の場合、<strong>翌日午前0:30に本ラウンドのデータは自動削除</strong>されます。
            </p>
            <p className="text-amber-700 text-xs">
              利用料：330円（決済はラウンド終了後にご案内します）
            </p>
          </div>
        </div>
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
        {creating ? "作成中..." : "同意してラウンド開始"}
      </button>

      <p className="text-center text-xs text-green-500">
        スタートホール：1番／記録モード：スコア記録（あとから変更可能）
      </p>
    </div>
  );
}
