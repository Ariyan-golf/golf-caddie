"use client";

import { useState } from "react";

const SWING_ISSUES = [
  "スライス", "フック", "トップ", "ダフリ", "シャンク",
  "飛距離不足", "方向性が不安定", "インパクトが弱い",
];

export default function SwingPage() {
  const [description, setDescription] = useState("");
  const [club, setClub] = useState("");
  const [shotResult, setShotResult] = useState("");
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [comingSoon, setComingSoon] = useState(false);

  function toggleIssue(issue: string) {
    setSelectedIssues((prev) =>
      prev.includes(issue) ? prev.filter((i) => i !== issue) : [...prev, issue]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setComingSoon(true);
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">📊 キャディアドバイス</h1>
        <p className="text-sm text-green-600 mt-1">キャディがスイングの悩みをアドバイスします</p>
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

        <button type="submit" className="btn-primary" disabled={!description}>
          スイングを分析する
        </button>
      </form>

      {comingSoon && (
        <div className="card text-center py-8 space-y-3">
          <p className="text-4xl">🚧</p>
          <p className="text-lg font-bold text-green-800">Coming Soon</p>
          <p className="text-sm text-green-600">この機能は近日公開予定です。お楽しみに！</p>
        </div>
      )}
    </div>
  );
}
