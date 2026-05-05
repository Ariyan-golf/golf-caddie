"use client";

import { useState, useRef } from "react";

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

interface KeyPoint {
  type: "ok" | "ng" | "info";
  text: string;
}

interface RuleResult {
  summary: string;
  rule_ref: string;
  key_points: KeyPoint[];
  steps: string[];
  penalty: string | null;
  situation?: string;
}

export function AiManagerClient() {
  // コース情報
  const [courseName, setCourseName] = useState("");
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseResult, setCourseResult] = useState<CourseInfo | null>(null);
  const [courseError, setCourseError] = useState("");

  // テキストルールQ&A
  const [ruleQuestion, setRuleQuestion] = useState("");
  const [ruleLoading, setRuleLoading] = useState(false);
  const [ruleResult, setRuleResult] = useState<RuleResult | null>(null);
  const [ruleError, setRuleError] = useState("");

  // カメラ・ビジョン
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState("image/jpeg");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraResult, setCameraResult] = useState<RuleResult | null>(null);
  const [cameraError, setCameraError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleCourseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!courseName.trim()) return;
    setCourseError("");
    setCourseResult(null);
    setCourseLoading(true);
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
      setCourseResult(await res.json());
    } catch (err) {
      setCourseError(err instanceof Error ? err.message : "取得に失敗しました。もう一度お試しください。");
    } finally {
      setCourseLoading(false);
    }
  }

  async function handleRuleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleQuestion.trim()) return;
    setRuleError("");
    setRuleResult(null);
    setRuleLoading(true);
    try {
      const res = await fetch("/api/ai-caddie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: ruleQuestion.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "APIエラー");
      }
      setRuleResult(await res.json());
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "取得に失敗しました。もう一度お試しください。");
    } finally {
      setRuleLoading(false);
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageType(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
    setCameraResult(null);
    setCameraError("");
  }

  async function handleCameraSubmit() {
    if (!imageBase64) return;
    setCameraError("");
    setCameraResult(null);
    setCameraLoading(true);
    try {
      const res = await fetch("/api/rule-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mediaType: imageType }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "APIエラー");
      }
      setCameraResult(await res.json());
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : "取得に失敗しました。もう一度お試しください。");
    } finally {
      setCameraLoading(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* ── ルール確認 ── */}
      <div className="card space-y-4">
        <h2 className="text-lg font-bold text-green-800">📋 ルール確認</h2>

        {/* テキストQ&A */}
        <form onSubmit={handleRuleSubmit} className="space-y-3">
          <textarea
            className="input text-base w-full resize-none"
            rows={3}
            placeholder="例：OBラインを越えたボールの処置は？"
            value={ruleQuestion}
            onChange={(e) => setRuleQuestion(e.target.value)}
            disabled={ruleLoading}
          />
          <button
            type="submit"
            className="btn-primary text-base py-3 w-full"
            disabled={ruleLoading || !ruleQuestion.trim()}
          >
            {ruleLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                調べています...
              </span>
            ) : "ルールを調べる"}
          </button>
        </form>

        {/* カメラ撮影 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 rounded-xl border-2 border-dashed border-green-300 text-green-600
                     font-semibold text-sm flex items-center justify-center gap-2
                     hover:bg-green-50 transition-colors active:bg-green-100"
        >
          📷 状況を撮影してルール確認
        </button>

        {imagePreview && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="撮影した状況" className="w-full rounded-xl max-h-48 object-cover" />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setImagePreview(null);
                  setImageBase64(null);
                  setCameraResult(null);
                  setCameraError("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="py-2.5 px-4 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50"
              >
                削除
              </button>
              <button
                onClick={handleCameraSubmit}
                disabled={cameraLoading}
                className="flex-1 btn-primary text-base py-2.5"
              >
                {cameraLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    確認中...
                  </span>
                ) : "この状況のルールを確認"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* テキストルール結果 */}
      {ruleError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 text-base">{ruleError}</div>
      )}
      {ruleResult && <RuleCard result={ruleResult} />}

      {/* カメラルール結果 */}
      {cameraError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 text-base">{cameraError}</div>
      )}
      {cameraResult && <RuleCard result={cameraResult} showDisclaimer />}

      {/* ── コース情報 ── */}
      <form onSubmit={handleCourseSubmit} className="card space-y-4">
        <h2 className="text-lg font-bold text-green-800">⛳ コース情報</h2>
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
            disabled={courseLoading}
          />
        </div>
        <button
          type="submit"
          className="btn-primary text-base py-4"
          disabled={courseLoading || !courseName.trim()}
        >
          {courseLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              AIが調べています...
            </span>
          ) : (
            "コース情報を調べる"
          )}
        </button>
      </form>

      {courseError && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 text-base">
          {courseError}
        </div>
      )}

      {courseResult && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="text-xl font-bold text-green-800">{courseResult.course_name}</h2>
            <p className="text-base text-green-700 leading-relaxed">{courseResult.overview}</p>
          </div>

          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>⛳</span> コース特徴
            </h3>
            <ul className="space-y-2">
              {courseResult.course_features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-base text-green-800">
                  <span className="text-green-500 font-bold mt-0.5 shrink-0">▸</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>👔</span> ドレスコード
            </h3>
            <ul className="space-y-2">
              {courseResult.dress_code.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <OkNgBadge ok={item.ok} />
                  <span className="text-base text-green-900">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>🤝</span> マナー
            </h3>
            <ul className="space-y-2">
              {courseResult.manners.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <OkNgBadge ok={item.ok} />
                  <span className="text-base text-green-900">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card space-y-3">
            <h3 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <span>⚠️</span> 注意点
            </h3>
            <ul className="space-y-2">
              {courseResult.notes.map((note, i) => (
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

function RuleCard({ result, showDisclaimer = false }: { result: RuleResult; showDisclaimer?: boolean }) {
  return (
    <div className="space-y-3">
      {result.situation && (
        <div className="card bg-sky-50 border-sky-200 space-y-1">
          <p className="text-xs font-semibold text-sky-600">📸 状況の説明</p>
          <p className="text-base text-sky-800 leading-relaxed">{result.situation}</p>
        </div>
      )}

      <div className="card bg-green-50 border-green-200 space-y-1">
        <p className="text-xs font-semibold text-green-600">裁定</p>
        <p className="text-base font-bold text-green-900">{result.summary}</p>
        {result.rule_ref && (
          <p className="text-xs text-green-500 font-medium">{result.rule_ref}</p>
        )}
        <p className="text-xs text-green-400 mt-1 pt-1 border-t border-green-200">
          2023年JGAゴルフ規則に基づく回答です
        </p>
      </div>

      {result.key_points.length > 0 && (
        <div className="card space-y-2">
          {result.key_points.map((kp, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                kp.type === "ok" ? "bg-green-100 text-green-700" :
                kp.type === "ng" ? "bg-red-100 text-red-600" :
                "bg-gray-100 text-gray-600"
              }`}>
                {kp.type === "ok" ? "✓" : kp.type === "ng" ? "✗" : "i"}
              </span>
              <p className="text-base text-green-900">{kp.text}</p>
            </div>
          ))}
        </div>
      )}

      {result.steps.length > 0 && (
        <div className="card space-y-2">
          <h4 className="text-sm font-semibold text-green-700">処置の手順</h4>
          {result.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-base text-green-900">{step}</p>
            </div>
          ))}
        </div>
      )}

      {result.penalty && (
        <div className="card bg-amber-50 border-amber-200">
          <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ ペナルティ</p>
          <p className="text-base text-amber-900">{result.penalty}</p>
        </div>
      )}

      {showDisclaimer && (
        <p className="text-xs text-gray-400 text-center px-2 leading-relaxed pb-2">
          この判断はAIによる参考情報です。正式な裁定はルール委員またはJGA公認ルール委員にご確認ください。
        </p>
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
