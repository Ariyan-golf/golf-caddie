"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompeJoinByCode() {
  const router = useRouter();
  const [code, setCode]       = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleJoin() {
    const normalized = code.trim();
    if (!normalized) { setError("参加コードを入力してください"); return; }

    setJoining(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/compe/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalized }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "参加に失敗しました");
      setJoining(false);
      return;
    }

    setSuccess(
      data.event_name ? `「${data.event_name}」に参加しました！` : "コンペに参加しました！"
    );
    setCode("");
    setJoining(false);
    // 参加したコンペが「コンペ開催中」に出るようホームを更新
    router.refresh();
  }

  return (
    <div className="card space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xl flex-shrink-0">🏆</span>
        <div>
          <p className="font-semibold text-green-800 text-sm">コンペに参加</p>
          <p className="text-xs text-green-500">幹事から共有された参加コードを入力</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="参加コード"
          maxLength={6}
          className="flex-1 border border-green-200 rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={handleJoin}
          disabled={joining || !code.trim()}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold flex-shrink-0"
        >
          {joining ? "…" : "参加"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-600 font-medium">{success}</p>}
    </div>
  );
}
