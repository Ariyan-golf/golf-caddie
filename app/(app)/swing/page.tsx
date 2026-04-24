"use client";

import { useState } from "react";

const SWING_ISSUES = [
  "スライス", "フック", "トップ", "ダフリ", "シャンク",
  "飛距離不足", "方向性が不安定", "インパクトが弱い",
];

interface SwingAnalysisResult {
  analysis: string;
  strengths: string[];
  issues: string[];
  tips: { title: string; detail: string }[];
  priority: string;
}

export default function SwingPage() {
  const [description, setDescription] = useState("");
  const [club, setClub] = useState("");
  const [shotResult, setShotResult] = useState("");
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SwingAnalysisResult | null>(null);
  const [error, setError] = useState("");

  function toggleIssue(issue: string) {
    setSelectedIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/swing-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          club: club || undefined,
          shotResult: shotResult || undefined,
          issues: selectedIssues,
        }),
      });

      if (!res.ok) throw new Error("APIエラー");
      setResult(await res.json());
    } catch {
      setError("分析の取得に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">📊 スイング分析</h1>
        <p className="text-sm text-green-600 mt-1">スイングの悩みをAIが分析・アドバイスします</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">使用番手</label>
          <select className="input" value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">選択してください</option>
            <option value="ドライバー">ドライバー</option>
            <option value="フェアウェイウッド">フェアウェイウッド</option>
            <option value="アイアン（長め）">アイアン（長め）</option>
            <option value="アイアン（短め）">アイアン（短め）</option>
            <option value="ウェッジ">ウェッジ</option>
            <option value="パター">パター</option>
          </select>
        </div>

        <div>
          <label className="label">ショット結果</label>
          <select className="input" value={shotResult} onChange={(e) => setShotResult(e.target.value)}>
            <option value="">選択してください</option>
            <option value="右に飛ぶ（スライス気味）">右に飛ぶ（スライス気味）</option>
            <option value="左に飛ぶ（フック気味）">左に飛ぶ（フック気味）</option>
            <option value="飛距離が出ない">飛距離が出ない</option>
            <option value="高さが出すぎる">高さが出すぎる</option>
            <option value="低いライナー">低いライナー</option>
            <option value="ミスが多い">ミスが多い</option>
          </select>
        </div>

        <div>
          <label className="label">課題・悩み（複数選択可）</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {SWING_ISSUES.map((issue) => (
              <button
                key={issue}
                type="button"
                onClick={() => toggleIssue(issue)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedIssues.includes(issue)
                    ? "bg-green-600 text-white"
                    : "bg-green-50 text-green-700 border border-green-200"
                }`}
              >
                {issue}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">スイングの説明・詳細 *</label>
          <textarea
            className="input min-h-24 resize-none"
            placeholder="例: テイクバックで右肘が浮いてしまう。インパクトの瞬間に手首が早くほどけてしまう感覚がある..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading || !description}>
          {loading ? "AIが分析中..." : "スイングを分析する"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="card">
            <p className="text-sm font-semibold text-green-700 mb-2">総合分析</p>
            <p className="text-sm text-green-800">{result.analysis}</p>
          </div>

          {result.strengths?.length > 0 && (
            <div className="card bg-blue-50 border-blue-100">
              <p className="text-sm font-semibold text-blue-700 mb-2">良い点</p>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-blue-800">
                    <span className="text-blue-500">✓</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.issues?.length > 0 && (
            <div className="card bg-orange-50 border-orange-100">
              <p className="text-sm font-semibold text-orange-700 mb-2">改善が必要な点</p>
              <ul className="space-y-1">
                {result.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2 text-sm text-orange-800">
                    <span className="text-orange-500">!</span>{issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <p className="text-sm font-semibold text-green-700 mb-3">改善ドリル</p>
            <div className="space-y-3">
              {result.tips.map((tip, i) => (
                <div key={i} className="border-l-2 border-green-400 pl-3">
                  <p className="text-sm font-medium text-green-800">{tip.title}</p>
                  <p className="text-xs text-green-600 mt-0.5">{tip.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card bg-green-600 text-white">
            <p className="text-xs font-medium opacity-80 mb-1">最優先の改善ポイント</p>
            <p className="text-sm font-semibold">{result.priority}</p>
          </div>
        </div>
      )}
    </div>
  );
}
