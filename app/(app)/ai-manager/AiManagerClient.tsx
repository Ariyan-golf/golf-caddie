"use client";

import { useState } from "react";

interface DressItem {
  ok: boolean;
  text: string;
}

interface CourseInfo {
  course_name: string;
  overview: string;
  course_features: string[];
  dress_code: DressItem[];
  manners: DressItem[];
  notes: string[];
}

export function AiManagerClient() {
  const [courseName, setCourseName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CourseInfo | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseName.trim()) return;
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName: courseName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "APIエラー");
      }

      const data: CourseInfo = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-base font-semibold text-green-700 mb-2">
            ゴルフ場名を入力
          </label>
          <input
            type="text"
            className="input text-base"
            placeholder="例：霞ヶ関カンツリー倶楽部"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="btn-primary text-base py-4"
          disabled={loading || !courseName.trim()}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              AIが調べています...
            </span>
          ) : (
            "コース情報を調べる"
          )}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 text-base">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* コース名・概要 */}
          <div className="card space-y-3">
            <h2 className="text-xl font-bold text-green-800">{result.course_name}</h2>
            <p className="text-base text-green-700 leading-relaxed">{result.overview}</p>
          </div>

          {/* コース特徴 */}
          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>⛳</span> コース特徴
            </h3>
            <ul className="space-y-2">
              {result.course_features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-base text-green-800">
                  <span className="text-green-500 font-bold mt-0.5 shrink-0">▸</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* ドレスコード */}
          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>👔</span> ドレスコード
            </h3>
            <ul className="space-y-2">
              {result.dress_code.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <OkNgBadge ok={item.ok} />
                  <span className="text-base text-green-900">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* マナー */}
          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>🤝</span> マナー
            </h3>
            <ul className="space-y-2">
              {result.manners.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <OkNgBadge ok={item.ok} />
                  <span className="text-base text-green-900">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 注意点 */}
          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>⚠️</span> 注意点
            </h3>
            <ul className="space-y-2">
              {result.notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-base text-green-800">
                  <span className="text-amber-500 font-bold mt-0.5 shrink-0">!</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-green-400 text-center pb-2">
            ※ AI生成情報です。最新情報はゴルフ場に直接ご確認ください。
          </p>
        </div>
      )}
    </div>
  );
}

function OkNgBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center w-10 h-7 rounded-md text-sm font-bold ${
        ok
          ? "bg-green-100 text-green-700 border border-green-300"
          : "bg-red-100 text-red-600 border border-red-300"
      }`}
    >
      {ok ? "OK" : "NG"}
    </span>
  );
}
