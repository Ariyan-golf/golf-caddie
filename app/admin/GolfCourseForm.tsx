"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";

// ── Constants ─────────────────────────────────────────────────────────

const GREEN_TYPES = ["メイングリーン", "サブグリーン"] as const;
const TEE_NAMES = ["チャンピオン", "バック", "レギュラー", "レディース", "シニア"] as const;
type TeeKey = "distance_tee1" | "distance_tee2" | "distance_tee3" | "distance_tee4";
const TEE_KEYS: TeeKey[] = ["distance_tee1", "distance_tee2", "distance_tee3", "distance_tee4"];

// ── Types ─────────────────────────────────────────────────────────────

interface TeeEntry {
  key: string;
  green_type: string;
  tee_name: string;
  course_rating: string;
  slope_rating: string;
  distance: string;
}

interface HoleInput {
  hole_number: number;
  par: number;
  hdcp: string;
  distance_tee1: string;
  distance_tee2: string;
  distance_tee3: string;
  distance_tee4: string;
}

interface RegisteredCourse {
  id: string;
  name: string;
  address: string | null;
  tee1_name: string | null;
  tee2_name: string | null;
  tee3_name: string | null;
  tee4_name: string | null;
  created_at: string;
}

interface ParsedHole {
  hole_number: number;
  par: number;
  hdcp: number | null;
  distances: (number | null)[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function defaultHoles(): HoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1, par: 4, hdcp: "",
    distance_tee1: "", distance_tee2: "", distance_tee3: "", distance_tee4: "",
  }));
}

function defaultTees(): TeeEntry[] {
  return [{
    key: crypto.randomUUID(),
    green_type: "メイングリーン",
    tee_name: "レギュラー",
    course_rating: "",
    slope_rating: "",
    distance: "",
  }];
}

// ── QR display ────────────────────────────────────────────────────────

function QrDisplay({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/golf-qr?course=${courseId}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: "#166534", light: "#ffffff" } })
      .then(setDataUrl).catch(() => {});
  }, [url]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl; a.download = `${courseName}-qr.png`; a.click();
  }

  if (!dataUrl) return <div className="w-32 h-32 bg-gray-100 rounded-lg animate-pulse" />;
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={dataUrl} alt="QRコード" className="w-40 h-40 rounded-lg border border-green-200" />
      <p className="text-xs text-green-600 break-all text-center max-w-xs">{url}</p>
      <button onClick={handleDownload}
        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
        QRダウンロード
      </button>
    </div>
  );
}

// ── Registered course card ────────────────────────────────────────────

function CourseCard({ course, onDelete }: { course: RegisteredCourse; onDelete: (id: string) => void }) {
  const [showQr, setShowQr] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const teeLabels = [course.tee1_name, course.tee2_name, course.tee3_name, course.tee4_name]
    .filter(Boolean).join(" / ");

  async function handleDelete() {
    if (!confirm(`「${course.name}」を削除しますか？\nコース・全ホールデータが削除されます。`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/golf-courses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      if (res.ok) onDelete(course.id);
    } finally { setDeleting(false); }
  }

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-green-800">{course.name}</p>
          {course.address && <p className="text-xs text-green-500 mt-0.5">{course.address}</p>}
          {teeLabels && <p className="text-xs text-green-400 mt-0.5">ティー: {teeLabels}</p>}
          <p className="text-xs text-gray-400 mt-1">
            登録日: {new Date(course.created_at).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowQr((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors">
            {showQr ? "QRを閉じる" : "QR発行"}
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-40">
            {deleting ? "削除中" : "削除"}
          </button>
        </div>
      </div>
      {showQr && (
        <div className="flex justify-center pt-2 border-t border-green-50">
          <QrDisplay courseId={course.id} courseName={course.name} />
        </div>
      )}
    </div>
  );
}

// ── Scorecard uploader ────────────────────────────────────────────────

function ScorecardUploader({ onParsed }: {
  onParsed: (tees: TeeEntry[], holes: HoleInput[]) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f); setParseError(null);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else { setPreview(null); }
  }

  const handleParse = useCallback(async () => {
    if (!file) return;
    setParsing(true); setParseError(null);
    const fd = new FormData(); fd.append("image", file);
    try {
      const res = await fetch("/api/parse-scorecard", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) { setParseError(data.error ?? "解析に失敗しました"); return; }

      const rawNames: string[] = Array.isArray(data.teeNames) ? data.teeNames : [];
      const parsedTees: TeeEntry[] = rawNames.slice(0, 4).map((name, i) => ({
        key: `parsed-${i}`,
        green_type: "メイングリーン",
        tee_name: TEE_NAMES.find((t) => name.includes(t)) ?? "レギュラー",
        course_rating: "", slope_rating: "", distance: "",
      }));
      if (parsedTees.length === 0) parsedTees.push(...defaultTees());

      const parsedHoles: ParsedHole[] = Array.isArray(data.holes) ? data.holes : [];
      const filled = defaultHoles().map((def) => {
        const found = parsedHoles.find((p) => p.hole_number === def.hole_number);
        if (!found) return def;
        return {
          ...def,
          par: found.par ?? def.par,
          hdcp: found.hdcp != null ? String(found.hdcp) : "",
          distance_tee1: found.distances?.[0] != null ? String(found.distances[0]) : "",
          distance_tee2: found.distances?.[1] != null ? String(found.distances[1]) : "",
          distance_tee3: found.distances?.[2] != null ? String(found.distances[2]) : "",
          distance_tee4: found.distances?.[3] != null ? String(found.distances[3]) : "",
        };
      });
      onParsed(parsedTees, filled);
    } catch { setParseError("通信エラーが発生しました"); }
    finally { setParsing(false); }
  }, [file, onParsed]);

  return (
    <div className="border border-dashed border-green-300 rounded-xl p-4 space-y-3 bg-green-50/40">
      <p className="text-xs font-semibold text-green-700">スコアカード写真から自動入力</p>
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => inputRef.current?.click()}
          className="px-3 py-2 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors">
          写真を選択
        </button>
        {file && (
          <button type="button" onClick={handleParse} disabled={parsing}
            className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">
            {parsing ? "解析中..." : "スコアカードを解析"}
          </button>
        )}
        {file && <span className="text-xs text-green-500 truncate max-w-[160px]">{file.name}</span>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      {preview && <img src={preview} alt="プレビュー" className="max-h-48 rounded-lg border border-green-200 object-contain" />}
      {parseError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {parseError}</p>}
      {parsing && <p className="text-xs text-green-600 animate-pulse">AIがスコアカードを解析しています...</p>}
    </div>
  );
}

// ── Tee entries section ───────────────────────────────────────────────

function TeeEntriesSection({ tees, onChange }: {
  tees: TeeEntry[];
  onChange: (tees: TeeEntry[]) => void;
}) {
  function addRow() {
    onChange([...tees, {
      key: crypto.randomUUID(),
      green_type: "メイングリーン",
      tee_name: "レギュラー",
      course_rating: "", slope_rating: "", distance: "",
    }]);
  }

  function removeRow(key: string) {
    onChange(tees.filter((t) => t.key !== key));
  }

  function updateRow(key: string, field: keyof Omit<TeeEntry, "key">, value: string) {
    onChange(tees.map((t) => t.key === key ? { ...t, [field]: value } : t));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-green-600 font-medium">グリーン・ティー設定（コースレート）</label>
        <button type="button" onClick={addRow}
          className="text-xs px-2.5 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors">
          + ティーを追加
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-green-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-green-50 border-b border-green-200">
              <th className="px-2 py-2 text-left text-green-700 font-semibold whitespace-nowrap">グリーン</th>
              <th className="px-2 py-2 text-left text-green-700 font-semibold whitespace-nowrap">ティー</th>
              <th className="px-2 py-2 text-center text-green-700 font-semibold whitespace-nowrap">CR</th>
              <th className="px-2 py-2 text-center text-green-700 font-semibold whitespace-nowrap">SR</th>
              <th className="px-2 py-2 text-center text-green-700 font-semibold whitespace-nowrap">距離(y)</th>
              <th className="px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {tees.map((tee) => (
              <tr key={tee.key} className="border-b border-green-50 last:border-0">
                <td className="px-1 py-1">
                  <select value={tee.green_type} onChange={(e) => updateRow(tee.key, "green_type", e.target.value)}
                    className="w-28 border border-green-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400">
                    {GREEN_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select value={tee.tee_name} onChange={(e) => updateRow(tee.key, "tee_name", e.target.value)}
                    className="w-24 border border-green-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-400">
                    {TEE_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input type="number" step="0.1" min="60" max="80" value={tee.course_rating}
                    onChange={(e) => updateRow(tee.key, "course_rating", e.target.value)}
                    placeholder="72.3"
                    className="w-16 border border-green-200 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" min="55" max="155" value={tee.slope_rating}
                    onChange={(e) => updateRow(tee.key, "slope_rating", e.target.value)}
                    placeholder="113"
                    className="w-14 border border-green-200 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                </td>
                <td className="px-1 py-1">
                  <input type="number" min="0" max="9999" value={tee.distance}
                    onChange={(e) => updateRow(tee.key, "distance", e.target.value)}
                    placeholder="6500"
                    className="w-16 border border-green-200 rounded px-1 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-green-400" />
                </td>
                <td className="px-1 py-1">
                  {tees.length > 1 && (
                    <button type="button" onClick={() => removeRow(tee.key)}
                      className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-green-400">CR=コースレート　SR=スロープレート（標準113）</p>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────

export function GolfCourseForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [localRules, setLocalRules] = useState("");
  const [tees, setTees] = useState<TeeEntry[]>(defaultTees);
  const [holes, setHoles] = useState<HoleInput[]>(defaultHoles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState<RegisteredCourse | null>(null);
  const [courses, setCourses] = useState<RegisteredCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/golf-courses")
      .then((r) => r.json())
      .then((d) => setCourses(d.courses ?? []))
      .catch(() => {})
      .finally(() => setLoadingCourses(false));
  }, [newCourse]);

  function updateHole(index: number, field: keyof Omit<HoleInput, "hole_number">, value: string | number) {
    setHoles((prev) => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
  }

  const handleParsed = useCallback((parsedTees: TeeEntry[], parsedHoles: HoleInput[]) => {
    setTees(parsedTees);
    setHoles(parsedHoles);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setNewCourse(null);

    const payload = {
      name, address, localRules,
      tees: tees.map((t) => ({
        green_type: t.green_type,
        tee_name: t.tee_name,
        course_rating: t.course_rating ? parseFloat(t.course_rating) : null,
        slope_rating: t.slope_rating ? parseInt(t.slope_rating) : null,
        distance: t.distance ? parseInt(t.distance) : null,
      })),
      teeNames: [
        tees[0]?.tee_name ?? "ティー1",
        tees[1]?.tee_name ?? "ティー2",
        tees[2]?.tee_name ?? "ティー3",
        tees[3]?.tee_name ?? "ティー4",
      ] as [string, string, string, string],
      holes: holes.map((h) => ({
        hole_number: h.hole_number, par: h.par,
        hdcp: h.hdcp ? parseInt(h.hdcp) : null,
        distance_tee1: h.distance_tee1 ? parseInt(h.distance_tee1) : null,
        distance_tee2: h.distance_tee2 ? parseInt(h.distance_tee2) : null,
        distance_tee3: h.distance_tee3 ? parseInt(h.distance_tee3) : null,
        distance_tee4: h.distance_tee4 ? parseInt(h.distance_tee4) : null,
      })),
    };

    const res = await fetch("/api/admin/golf-courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "エラーが発生しました");
    } else {
      setNewCourse(data.course);
      setName(""); setAddress(""); setLocalRules("");
      setTees(defaultTees()); setHoles(defaultHoles());
      setTimeout(() => successRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
    setLoading(false);
  }

  // Active tee columns (first N where N = number of tees, max 4)
  const activeTeeCount = Math.min(tees.length, 4);
  const activeTeeKeys = TEE_KEYS.slice(0, activeTeeCount);

  return (
    <div className="space-y-6">
      {/* 登録済みコース一覧 */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-green-700">登録済みゴルフ場</p>
        {loadingCourses ? (
          <p className="text-sm text-green-400">読み込み中...</p>
        ) : courses.length === 0 ? (
          <p className="text-sm text-green-400">まだ登録されていません</p>
        ) : (
          courses.map((c) => (
            <CourseCard key={c.id} course={c}
              onDelete={(id) => setCourses((prev) => prev.filter((x) => x.id !== id))} />
          ))
        )}
      </div>

      {/* 登録成功時のQR表示 */}
      <div ref={successRef}>
        {newCourse && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-green-700">「{newCourse.name}」を登録しました！</p>
            <QrDisplay courseId={newCourse.id} courseName={newCourse.name} />
          </div>
        )}
      </div>

      {/* 新規登録フォーム */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm font-semibold text-green-700">新しいゴルフ場を登録</p>

        {/* 基本情報 */}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">ゴルフ場名 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required
              placeholder="〇〇カントリークラブ"
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">住所</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="〒000-0000 ○○県○○市..."
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">ローカルルール</label>
            <textarea value={localRules} onChange={(e) => setLocalRules(e.target.value)} rows={3}
              placeholder="OB杭の色、特設ティー、カート道路等のローカルルールを記載..."
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none" />
          </div>
        </div>

        {/* グリーン・ティー設定 */}
        <TeeEntriesSection tees={tees} onChange={setTees} />

        {/* スコアカード写真アップロード */}
        <ScorecardUploader onParsed={handleParsed} />

        {/* 18ホール入力テーブル */}
        <div>
          <label className="text-xs text-green-600 font-medium block mb-2">ホールデータ（距離: ヤード）</label>
          <div className="overflow-x-auto rounded-xl border border-green-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-green-50 border-b border-green-200">
                  <th className="px-2 py-2 text-left text-green-700 font-semibold whitespace-nowrap">H</th>
                  <th className="px-2 py-2 text-center text-green-700 font-semibold">Par</th>
                  <th className="px-2 py-2 text-center text-green-700 font-semibold">Hdcp</th>
                  {activeTeeKeys.map((key, i) => (
                    <th key={key} className="px-2 py-2 text-center font-semibold text-green-600 whitespace-nowrap">
                      {tees[i]
                        ? `${tees[i].green_type === "サブグリーン" ? "S/" : ""}${tees[i].tee_name}`
                        : `ティー${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map((hole, i) => (
                  <tr key={hole.hole_number}
                    className={`border-b border-green-50 ${i === 8 ? "border-b-2 border-green-300" : ""}`}>
                    <td className="px-2 py-1.5 font-semibold text-green-700 whitespace-nowrap">
                      {hole.hole_number}
                      {hole.hole_number === 9  && <span className="text-green-400 ml-1">(OUT)</span>}
                      {hole.hole_number === 18 && <span className="text-green-400 ml-1">(IN)</span>}
                    </td>
                    <td className="px-1 py-1">
                      <select value={hole.par} onChange={(e) => updateHole(i, "par", parseInt(e.target.value))}
                        className="w-12 border border-green-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400">
                        <option value={3}>3</option><option value={4}>4</option><option value={5}>5</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input type="number" min={1} max={18} value={hole.hdcp}
                        onChange={(e) => updateHole(i, "hdcp", e.target.value)} placeholder="—"
                        className="w-12 border border-green-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400" />
                    </td>
                    {activeTeeKeys.map((key) => (
                      <td key={key} className="px-1 py-1">
                        <input type="number" min={0} max={999}
                          value={(hole as unknown as Record<string, string>)[key]}
                          onChange={(e) => updateHole(i, key, e.target.value)} placeholder="—"
                          className="w-14 border border-green-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠️ {error}
          </p>
        )}

        <button type="submit" disabled={loading || !name.trim()}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
          {loading ? "登録中..." : "ゴルフ場を登録してQRコードを発行"}
        </button>
      </form>
    </div>
  );
}
