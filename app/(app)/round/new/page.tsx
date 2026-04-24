"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewRoundPage() {
  const router = useRouter();
  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: err } = await supabase
      .from("rounds")
      .insert({ user_id: user!.id, course_name: courseName, date })
      .select("id")
      .single();

    if (err) {
      setError("ラウンドの作成に失敗しました");
      setLoading(false);
      return;
    }

    router.push(`/round/${data.id}`);
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">ラウンド開始</h1>
        <p className="text-sm text-green-600 mt-1">コース情報を入力してください</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">{error}</div>
        )}
        <div>
          <label className="label">コース名 *</label>
          <input
            type="text"
            className="input"
            placeholder="例: 東京ゴルフクラブ"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">プレー日</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading || !courseName}>
          {loading ? "作成中..." : "ラウンドを開始する"}
        </button>
      </form>
    </div>
  );
}
