"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Round {
  id: string;
  course_name: string;
  date: string;
  total_score: number | null;
}

export function RoundListClient({ rounds: initialRounds }: { rounds: Round[] }) {
  const [rounds, setRounds] = useState(initialRounds);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function deleteRound(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from("rounds").delete().eq("id", id);
    setRounds((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
    setConfirmId(null);
  }

  if (!rounds.length) {
    return (
      <div className="card text-center py-12">
        <p className="text-4xl mb-3">⛳</p>
        <p className="text-green-600 font-medium">まだラウンドがありません</p>
        <p className="text-sm text-green-400 mt-1">新規ラウンドを開始しましょう</p>
        <Link
          href="/round/new"
          className="btn-primary mt-4 inline-block"
          style={{ width: "auto", paddingLeft: "2rem", paddingRight: "2rem" }}
        >
          ラウンド開始
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rounds.map((round) =>
        confirmId === round.id ? (
          <div key={round.id} className="card border-red-200 bg-red-50">
            <p className="text-sm font-medium text-red-800 mb-3">
              「{round.course_name}」を削除しますか？この操作は取り消せません。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => deleteRound(round.id)}
                disabled={deletingId === round.id}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deletingId === round.id ? "削除中..." : "削除する"}
              </button>
              <button
                onClick={() => setConfirmId(null)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div
            key={round.id}
            className="card flex items-center hover:border-green-300 transition-colors"
          >
            <Link href={`/round/${round.id}`} className="flex-1 flex items-center justify-between">
              <div>
                <p className="font-semibold text-green-800">{round.course_name}</p>
                <p className="text-sm text-green-500">
                  {new Date(round.date).toLocaleDateString("ja-JP")}
                </p>
              </div>
              <div className="text-right mr-3">
                {round.total_score ? (
                  <span className="text-2xl font-bold text-green-700">{round.total_score}</span>
                ) : (
                  <span className="badge bg-yellow-100 text-yellow-700">進行中</span>
                )}
              </div>
            </Link>
            <button
              onClick={() => setConfirmId(round.id)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              aria-label="削除"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )
      )}
    </div>
  );
}
