"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

interface HoleInput {
  hole_number: number;
  par: number;
  hdcp: string;
  distance_blue: string;
  distance_orange: string;
  distance_white: string;
  distance_red: string;
}

interface RegisteredCourse {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
}

function defaultHoles(): HoleInput[] {
  return Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    hdcp: "",
    distance_blue: "",
    distance_orange: "",
    distance_white: "",
    distance_red: "",
  }));
}

function QrDisplay({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [dataUrl, setDataUrl] = useState<string>("");
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

function CourseCard({ course }: { course: RegisteredCourse }) {
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="bg-white border border-green-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-green-800">{course.name}</p>
          {course.address && <p className="text-xs text-green-500 mt-0.5">{course.address}</p>}
          <p className="text-xs text-gray-400 mt-1">
            登録日: {new Date(course.created_at).toLocaleDateString("ja-JP")}
          </p>
        </div>
        <button
          onClick={() => setShowQr((v) => !v)}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition-colors"
        >
          {showQr ? "QRを閉じる" : "QRコード発行"}
        </button>
      </div>
      {showQr && (
        <div className="flex justify-center pt-2 border-t border-green-50">
          <QrDisplay courseId={course.id} courseName={course.name} />
        </div>
      )}
    </div>
  );
}

export function GolfCourseForm() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [localRules, setLocalRules] = useState("");
  const [holes, setHoles] = useState<HoleInput[]>(defaultHoles);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState<RegisteredCourse | null>(null);
  const [courses, setCourses] = useState<RegisteredCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNewCourse(null);

    const payload = {
      name,
      address,
      localRules,
      holes: holes.map((h) => ({
        hole_number: h.hole_number,
        par: h.par,
        hdcp: h.hdcp ? parseInt(h.hdcp) : null,
        distance_blue: h.distance_blue ? parseInt(h.distance_blue) : null,
        distance_orange: h.distance_orange ? parseInt(h.distance_orange) : null,
        distance_white: h.distance_white ? parseInt(h.distance_white) : null,
        distance_red: h.distance_red ? parseInt(h.distance_red) : null,
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
      setHoles(defaultHoles());
      formRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    setLoading(false);
  }

  const teeHeaders = [
    { key: "distance_blue",   label: "BLUE",   cls: "text-blue-600" },
    { key: "distance_orange", label: "ORANGE", cls: "text-orange-500" },
    { key: "distance_white",  label: "WHITE",  cls: "text-gray-500" },
    { key: "distance_red",    label: "RED",    cls: "text-red-500" },
  ] as const;

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
          courses.map((c) => <CourseCard key={c.id} course={c} />)
        )}
      </div>

      {/* 新規登録フォーム */}
      <div ref={formRef}>
        {newCourse && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-4">
            <p className="text-sm font-semibold text-green-700">「{newCourse.name}」を登録しました！</p>
            <QrDisplay courseId={newCourse.id} courseName={newCourse.name} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-sm font-semibold text-green-700">新しいゴルフ場を登録</p>

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
                  {teeHeaders.map((t) => (
                    <th key={t.key} className={`px-2 py-2 text-center font-semibold ${t.cls}`}>{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holes.map((hole, i) => (
                  <tr key={hole.hole_number} className={`border-b border-green-50 ${i === 8 ? "border-b-2 border-green-300" : ""}`}>
                    <td className="px-2 py-1.5 font-semibold text-green-700 whitespace-nowrap">
                      {hole.hole_number}
                      {hole.hole_number === 9 && <span className="text-green-400 ml-1">(OUT)</span>}
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
                    {teeHeaders.map((t) => (
                      <td key={t.key} className="px-1 py-1">
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={(hole as unknown as Record<string, string>)[t.key]}
                          onChange={(e) => updateHole(i, t.key, e.target.value)}
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
