"use client";

import { useState } from "react";

interface KeyPoint {
  type: "ok" | "ng" | "info";
  text: string;
}

interface RuleAnswer {
  summary: string;
  rule_ref: string;
  key_points: KeyPoint[];
  steps: string[];
  penalty: string | null;
}

const EXAMPLES = [
  "OBの処置は？",
  "ドロップの高さは？",
  "救済エリアはどこ？",
  "バンカーで地面に触れていい？",
  "グリーン上でスパイクマークを直せる？",
  "暫定球はいつ打つ？",
];

export function AiCaddieClient() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RuleAnswer | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-caddie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "APIエラー");
      }

      const data: RuleAnswer = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  function selectExample(ex: string) {
    setQuestion(ex);
    setResult(null);
    setError("");
  }

  return (
    <div className="space-y-4">
      {/* 質問フォーム */}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-base font-semibold text-green-700 mb-2">
            ルールを質問する
          </label>
          <textarea
            className="input text-base resize-none"
            rows={3}
            placeholder="例：OBの処置は？　ドロップの高さは？"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* 例文ボタン */}
        <div>
          <p className="text-xs text-green-500 mb-2">質問例（タップで入力）</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => selectExample(ex)}
                className="text-xs px-3 py-1.5 rounded-full border border-green-200 bg-green-50
                           text-green-700 hover:bg-green-100 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary text-base py-4"
          disabled={loading || !question.trim()}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              規則を確認中...
            </span>
          ) : (
            "規則を確認する"
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
          {/* サマリー */}
          <div className="card bg-green-700 border-green-700 space-y-1">
            <p className="text-xs text-green-200 font-medium">📖 {result.rule_ref}</p>
            <p className="text-lg font-bold text-white leading-snug">{result.summary}</p>
          </div>

          {/* キーポイント */}
          {result.key_points.length > 0 && (
            <div className="card space-y-3">
              <h3 className="text-base font-bold text-green-800">ポイント</h3>
              <ul className="space-y-2">
                {result.key_points.map((pt, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <KeyBadge type={pt.type} />
                    <span className="text-base text-green-900 leading-snug pt-0.5">{pt.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 手順 */}
          {result.steps.length > 0 && (
            <div className="card space-y-3">
              <h3 className="text-base font-bold text-green-800">処置の手順</h3>
              <ol className="space-y-2">
                {result.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-green-600 text-white
                                     text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-base text-green-900 leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* ペナルティ */}
          {result.penalty && (
            <div className="card bg-amber-50 border-amber-200 flex items-start gap-3">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-800 mb-0.5">ペナルティ</p>
                <p className="text-base text-amber-900">{result.penalty}</p>
              </div>
            </div>
          )}

          <p className="text-xs text-green-400 text-center pb-2">
            ※ R&A/JGA ゴルフ規則2024年版に準拠。競技では公式裁定を優先してください。
          </p>
        </div>
      )}
    </div>
  );
}

function KeyBadge({ type }: { type: "ok" | "ng" | "info" }) {
  if (type === "ok") {
    return (
      <span className="shrink-0 inline-flex items-center justify-center w-10 h-7 rounded-md
                       text-sm font-bold bg-green-100 text-green-700 border border-green-300">
        OK
      </span>
    );
  }
  if (type === "ng") {
    return (
      <span className="shrink-0 inline-flex items-center justify-center w-10 h-7 rounded-md
                       text-sm font-bold bg-red-100 text-red-600 border border-red-300">
        NG
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center justify-center w-10 h-7 rounded-md
                     text-sm font-bold bg-gray-100 text-gray-600 border border-gray-300">
      情報
    </span>
  );
}
