"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";

// ── Types ────────────────────────────────────────────────────────────

interface HoleInput {
  hole_number: number;
  par: number;
  hdcp: string;
  distance_tee1: string;
  distance_tee2: string;
  distance_tee3: string;
  distance_tee4: string;
}

type TeeKey = "distance_tee1" | "distance_tee2" | "distance_tee3" | "distance_tee4";
const TEE_KEYS: TeeKey[] = ["distance_tee1", "distance_tee2", "distance_tee3", "distance_tee4"];

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

// ── Helpers ──────────────────────────────────────────────────────────

function defaultHoles(): HoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    hdcp: "",
    distance_tee1: "",
    distance_tee2: "",
    distance_tee3: "",
    distance_tee4: "",
  }));
}

function defaultTeeNames(): [string, string, string, string] {
  return ["ティー1", "ティー2", "ティー3", "ティー4"];
}

// ── QR display ───────────────────────────────────────────────────────

function QrDisplay({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [dataUrl, setDataUrl] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/golf-qr?course=${courseId}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 256, margin: 2, color: { dark: "#166534", light: "#ffffff" } })
      .then(setDataUrl)
      .catch(() => {});
  }, [url]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${courseName}-qr.png`;
    a.click();
  }

  if (!dataUrl) return <div className="w-32 h-32 bg-gray-100 rounded-lg animate-pulse" />;

  return (
    <div className="flex flex-col items-center gap-2">
      <img src={dataUrl} alt="QRコード" className="w-40 h-40 rounded-lg border border-green-200" />
      <p className="text-xs text-green-600 break-all text-center max-w-xs">{url}</p>
      <button
        onClick={handleDownload}
        className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
      >
        QRダウンロード
      </button>
    </div>
  );
}

// ── Registered course card ───────────────────────────────────────────

function CourseCard({
  course,
  onDelete,
}: {
  course: RegisteredCourse;
  onDelete: (id: string) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const teeLabels = [
    course.tee1_name, course.tee2_name, course.tee3_name, course.tee4_name,
  ].filter(Boolean).join(" / ");

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
    } finally {
      setDeleting(false);
    }
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
          <button
            onClick={() => setShowQr((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors"
          >
            {showQr ? "QRを閉じる" : "QR発行"}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-40"
          >
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

// ── Scorecard photo uploader ─────────────────────────────────────────

function ScorecardUploader({
  onParsed,
}: {
  onParsed: (teeNames: [string, string, string, string], holes: HoleInput[]) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setParseError(null);
    if (f) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  const handleParse = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setParseError(null);

    const fd = new FormData();
    fd.append("image", file);

    try {
      const res = await fetch("/api/parse-scorecard", { method: "POST", body: fd });
      const data = await res.json();

      if (!res.ok) {
        setParseError(data.error ?? "解析に失敗しました");
        return;
      }

      // Map parsed data to form state
      const rawNames: string[] = Array.isArray(data.teeNames) ? data.teeNames : [];
      const teeNames: [string, string, string, string] = [
        rawNames[0] ?? "ティー1",
        rawNames[1] ?? "ティー2",
        rawNames[2] ?? "ティー3",
        rawNames[3] ?? "ティー4",
      ];

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

      onParsed(teeNames, filled);
    } catch {
      setParseError("通信エラーが発生しました");
    } finally {
      setParsing(false);
    }
  }, [file, onParsed]);

  return (
    <div className="border border-dashed border-green-300 rounded-xl p-4 space-y-3 bg-green-50/40">
      <p className="text-xs font-semibold text-green-700">スコアカード写真から自動入力</p>
      <p className="text-xs text-green-500">
        スコアカードを撮影した写真をアップロードすると、ホールデータを自動で読み取ります。
      </p>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="px-3 py-2 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors"
        >
          写真を選択
        </button>
        {file && (
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing}
            className="px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {parsing ? "解析中..." : "スコアカードを解析"}
          </button>
        )}
        {file && <span className="text-xs text-green-500 truncate max-w-[160px]">{file.name}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {preview && (
        <img
          src={preview}
          alt="スコアカードプレビュー"
          className="max-h-48 rounded-lg border border-green-200 object-contain"
        />
      )}

      {parseError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ⚠️ {parseError}
        </p>
      )}

      {parsing && (
        <p className="text-xs text-green-600 animate-pulse">
          AIがスコアカードを解析しています...
        </p>
      )}
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────

export function GolfCourseForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [localRules, setLocalRules] = useState("");
  const [teeNames, setTeeNames] = useState<[string, string, string, string]>(defaultTeeNames());
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

  function updateTeeName(index: number, value: string) {
    setTeeNames((prev) => {
      const next = [...prev] as [string, string, string, string];
      next[index] = value;
      return next;
    });
  }

  function updateHole(index: number, field: keyof Omit<HoleInput, "hole_number">, value: string | number) {
    setHoles((prev) => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
  }

  const handleParsed = useCallback(
    (parsedNames: [string, string, string, string], parsedHoles: HoleInput[]) => {
      setTeeNames(parsedNames);
      setHoles(parsedHoles);
    },
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNewCourse(null);

    const payload = {
      name,
      address,
      localRules,
      teeNames,
      holes: holes.map((h) => ({
        hole_number: h.hole_number,
        par: h.par,
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
      setName("");
      setAddress("");
      setLocalRules("");
      setTeeNames(defaultTeeNames());
      setHoles(defaultHoles());
      setTimeout(() => successRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
    setLoading(false);
  }

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
            <CourseCard
              key={c.id}
              course={c}
              onDelete={(id) => setCourses((prev) => prev.filter((x) => x.id !== id))}
            />
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="〇〇カントリークラブ"
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">住所</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="〒000-0000 ○○県○○市..."
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <div>
            <label className="text-xs text-green-600 font-medium block mb-1">ローカルルール</label>
            <textarea
              value={localRules}
              onChange={(e) => setLocalRules(e.target.value)}
              rows={3}
              placeholder="OB杭の色、特設ティー、カート道路等のローカルルールを記載..."
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>
        </div>

        {/* ティー名称設定 */}
        <div>
          <label className="text-xs text-green-600 font-medium block mb-2">ティーグランド名称（最大4つ）</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {teeNames.map((name, i) => (
              <div key={i}>
                <label className="text-xs text-gray-400 block mb-0.5">ティー {i + 1}</label>
                <input
                  value={name}
                  onChange={(e) => updateTeeName(i, e.target.value)}
                  placeholder={`ティー${i + 1}`}
                  className="w-full border border-green-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            ))}
          </div>
        </div>

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
                  {TEE_KEYS.map((key, i) => (
                    <th key={key} className="px-2 py-2 text-center font-semibold text-green-600 whitespace-nowrap">
                      {teeNames[i] || `ティー${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map((hole, i) => (
                  <tr
                    key={hole.hole_number}
                    className={`border-b border-green-50 ${i === 8 ? "border-b-2 border-green-300" : ""}`}
                  >
                    <td className="px-2 py-1.5 font-semibold text-green-700 whitespace-nowrap">
                      {hole.hole_number}
                      {hole.hole_number === 9  && <span className="text-green-400 ml-1">(OUT)</span>}
                      {hole.hole_number === 18 && <span className="text-green-400 ml-1">(IN)</span>}
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={hole.par}
                        onChange={(e) => updateHole(i, "par", parseInt(e.target.value))}
                        className="w-12 border border-green-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                      >
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={1}
                        max={18}
                        value={hole.hdcp}
                        onChange={(e) => updateHole(i, "hdcp", e.target.value)}
                        placeholder="—"
                        className="w-12 border border-green-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                      />
                    </td>
                    {TEE_KEYS.map((key) => (
                      <td key={key} className="px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={(hole as unknown as Record<string, string>)[key]}
                          onChange={(e) => updateHole(i, key, e.target.value)}
                          placeholder="—"
                          className="w-14 border border-green-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                        />
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

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? "登録中..." : "ゴルフ場を登録してQRコードを発行"}
        </button>
      </form>
    </div>
  );
}
