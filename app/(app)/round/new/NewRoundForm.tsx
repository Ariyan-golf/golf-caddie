"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchWeather } from "@/lib/weather";
import { startGpsTracking } from "@/lib/gps";
import { acquireWakeLock } from "@/lib/wakeLock";
import { GeoPermissionGuide } from "@/components/GeoPermissionGuide";
import type { StartHole, Weather, WindSpeed, WindDirection } from "@/types";
import { WEATHER_OPTIONS, WIND_SPEED_OPTIONS } from "@/types";
import { REGION_PREFECTURES } from "@/lib/region-prefectures";

const WIND_DIRECTION_GRID: { dir: WindDirection; row: number; col: number }[] = [
  { dir: "北西", row: 0, col: 0 },
  { dir: "北",   row: 0, col: 1 },
  { dir: "北東", row: 0, col: 2 },
  { dir: "西",   row: 1, col: 0 },
  { dir: "東",   row: 1, col: 2 },
  { dir: "南西", row: 2, col: 0 },
  { dir: "南",   row: 2, col: 1 },
  { dir: "南東", row: 2, col: 2 },
];

function ToggleButton({
  label, selected, onClick,
}: {
  label: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-2 px-3 rounded-xl border-2 text-sm font-bold transition-colors active:scale-95 ${
        selected
          ? "bg-green-600 border-green-600 text-white"
          : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
      }`}
    >
      {label}
    </button>
  );
}

const WIND_DIR_DEG_LOCAL: Record<string, number> = {
  "北": 0, "北東": 45, "東": 90, "南東": 135,
  "南": 180, "南西": 225, "西": 270, "北西": 315,
};

function WindDirectionCompass({ direction }: { direction: string }) {
  const deg = WIND_DIR_DEG_LOCAL[direction];
  if (deg === undefined) return null;
  const arrowDeg = deg + 180;
  return (
    <div className="flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 max-w-[240px] mx-auto">
      <svg viewBox="0 0 80 80" className="flex-shrink-0" style={{ width: 80, height: 80 }} aria-label={`風向き ${direction}`}>
        <circle cx="40" cy="40" r="34" fill="white" stroke="#7dd3fc" strokeWidth="1.5" />
        <text x="40" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#dc2626">N</text>
        <text x="68" y="44" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569">E</text>
        <text x="40" y="73" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569">S</text>
        <text x="12" y="44" textAnchor="middle" fontSize="9" fontWeight="700" fill="#475569">W</text>
        <g transform={`rotate(${arrowDeg} 40 40)`}>
          <line x1="40" y1="56" x2="40" y2="24" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
          <polygon points="40,18 35,26 45,26" fill="#0284c7" />
        </g>
        <circle cx="40" cy="40" r="2" fill="#0284c7" />
      </svg>
      <div className="leading-tight">
        <p className="text-sm font-bold text-sky-700">風向き：{direction}</p>
        <p className="text-xs text-sky-500">自動取得</p>
      </div>
    </div>
  );
}

type WeatherStatus = "idle" | "locating" | "fetching" | "ok" | "error";

interface GolfCourse {
  id: string;
  name: string;
  region: string | null;
  prefecture: string | null;
  name_kana: string | null;
}

interface CourseTee {
  id: string;
  green_type: string;
  tee_name: string;
  course_rating: number | null;
  slope_rating: number | null;
  distance: number | null;
  display_order: number | null;
}

export function NewRoundForm({ linkedCourseId }: { linkedCourseId?: string }) {
  const router = useRouter();

  // ゴルフ場選択（3段階ドリルダウン）
  const [courses, setCourses]                   = useState<GolfCourse[]>([]);
  const [selectedRegion, setSelectedRegion]     = useState("");
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState(linkedCourseId ?? "");
  const [courseName, setCourseName]             = useState("");
  const [courseType, setCourseType]             = useState<string>("18H");
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);

  // ティー
  const [tees, setTees]               = useState<CourseTee[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState("");
  const [teesLoading, setTeesLoading] = useState(false);

  // コース選択（27H/36H）
  const [sections, setSections]       = useState<string[]>([]);
  const [outSection, setOutSection]   = useState("");
  const [inSection, setInSection]     = useState("");

  // ラウンド情報
  const [date, setDate]               = useState(new Date().toISOString().split("T")[0]);
  const [startHole, setStartHole]     = useState<StartHole>(1);
  const [mode, setMode]               = useState<"shot" | "score">("score");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  // 天気
  const [weather, setWeather]               = useState<Weather | null>(null);
  const [windSpeed, setWindSpeed]           = useState<WindSpeed | null>(null);
  const [windDirection, setWindDirection]   = useState<WindDirection | null>(null);
  const [weatherStatus, setWeatherStatus]   = useState<WeatherStatus>("idle");
  const [temperature, setTemperature]       = useState<number | null>(null);
  const [showGeoGuide, setShowGeoGuide]     = useState(false);

  // 登録済みゴルフ場を初回ロード
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("golf_courses")
      .select("id, name, region, prefecture, name_kana")
      .order("name_kana", { nullsFirst: false })
      .then(({ data }) => setCourses(data ?? []));
  }, []);

  // ゴルフ場選択時 → ティー・セクション取得＆コース名自動入力
  useEffect(() => {
    if (!selectedCourseId) {
      setTees([]);
      setSelectedTeeId("");
      setCourseType("18H");
      setSections([]);
      setOutSection("");
      setInSection("");
      return;
    }
    setTeesLoading(true);
    fetch(`/api/course-tees?courseId=${selectedCourseId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.course?.name) setCourseName(data.course.name);

        const ct: string = data.course?.course_type ?? "18H";
        setCourseType(ct);

        const newTees: CourseTee[] = data.tees ?? [];
        setTees(newTees);
        setSelectedTeeId(newTees.length > 0 ? newTees[0].id : "");

        const newSections: string[] = data.sections ?? [];
        setSections(newSections);
        if (ct === "27H" && newSections.length >= 2) {
          setOutSection(newSections[0]);
          setInSection(newSections[1]);
        } else if (ct === "36H" && newSections.length >= 1) {
          setOutSection(newSections[0]);
          setInSection("");
        } else {
          setOutSection("");
          setInSection("");
        }
      })
      .catch(() => {})
      .finally(() => setTeesLoading(false));
  }, [selectedCourseId]);

  const selectedTee = tees.find((t) => t.id === selectedTeeId) ?? null;

  function formatTeeLabel(t: CourseTee) {
    let label = `${t.green_type} / ${t.tee_name}`;
    const parts: string[] = [];
    if (t.course_rating != null) parts.push(`CR:${t.course_rating}`);
    if (t.slope_rating  != null) parts.push(`SR:${t.slope_rating}`);
    if (parts.length > 0) label += `（${parts.join(" / ")}）`;
    return label;
  }

  async function handleAutoWeather() {
    console.log("[weather] start fetch");
    if (!navigator.geolocation) {
      console.error("[weather] navigator.geolocation is undefined", {
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
        isSecureContext: typeof window !== "undefined" ? window.isSecureContext : "n/a",
      });
      setWeatherStatus("error");
      return;
    }
    setWeatherStatus("locating");
    const options: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };
    console.log("[weather] calling getCurrentPosition", options);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log("[weather] getCurrentPosition OK", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setWeatherStatus("fetching");
        const data = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
        if (!data) {
          console.error("[weather] fetchWeather returned null");
          setWeatherStatus("error");
          return;
        }
        console.log("[weather] fetchWeather OK", data);
        setWeather(data.weather);
        setWindSpeed(data.windSpeed);
        setWindDirection(data.windDirection);
        setTemperature(data.temperature);
        setWeatherStatus("ok");
      },
      (err) => {
        console.error("[weather] getCurrentPosition ERR", {
          code: err.code,
          codeMeaning:
            err.code === 1 ? "PERMISSION_DENIED"
            : err.code === 2 ? "POSITION_UNAVAILABLE"
            : err.code === 3 ? "TIMEOUT"
            : "UNKNOWN",
          message: err.message,
          options,
        });
        setWeatherStatus("error");
      },
      options,
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error: err } = await supabase
      .from("rounds")
      .insert({
        user_id:        user!.id,
        course_name:    courseName,
        date,
        start_hole:     startHole,
        mode,
        weather:        weather ?? null,
        wind_speed:     windSpeed ?? null,
        wind_direction: windDirection ?? null,
        golf_course_id: selectedCourseId || null,
        ...(selectedTee ? {
          course_tee_id:  selectedTee.id,
          course_rating:  selectedTee.course_rating ?? null,
          slope_rating:   selectedTee.slope_rating ?? null,
        } : {}),
        ...(selectedCourseId ? {
          out_section: outSection || null,
          in_section:  inSection  || null,
        } : {}),
      })
      .select("id")
      .single();

    if (err) {
      setError("ラウンドの作成に失敗しました");
      setLoading(false);
      return;
    }

    void startGpsTracking();
    void acquireWakeLock();

    router.push(`/round/${data.id}`);
  }

  const compassGrid: (WindDirection | null)[][] = Array.from({ length: 3 }, () => [null, null, null]);
  for (const { dir, row, col } of WIND_DIRECTION_GRID) {
    compassGrid[row][col] = dir;
  }

  const autoLabel: Record<WeatherStatus, string | null> = {
    idle: null, locating: "📡 GPS取得中...", fetching: "🌐 天気取得中...", ok: null, error: null,
  };

  // 27H の IN セクション候補（OUT で選んだものを除外）
  const inSectionOptions = sections.filter((s) => s !== outSection);

  return (
    <>
    <form onSubmit={handleSubmit} className="card space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* ── ゴルフ場選択 ───────────────────────────────── */}
      <div className="space-y-3">
        <label className="label">ゴルフ場</label>

        {/* 未選択: モーダルを開くボタン */}
        {!selectedCourseId && selectedRegion !== "__manual__" && (
          <button
            type="button"
            className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-green-300 bg-white text-sm font-bold text-green-600
                       hover:bg-green-50 transition-colors active:scale-[0.98]"
            onClick={() => setIsCourseModalOpen(true)}
          >
            ゴルフ場を選ぶ
          </button>
        )}

        {/* 選択確定表示 */}
        {selectedCourseId && selectedRegion !== "__manual__" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-green-700 font-medium">{courseName}</span>
            <button
              type="button"
              className="text-xs text-green-600 underline"
              onClick={() => { setSelectedCourseId(""); setCourseName(""); setIsCourseModalOpen(true); }}
            >
              変更
            </button>
          </div>
        )}

        {/* 手動入力モード */}
        {selectedRegion === "__manual__" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-700 font-medium">指定なし（手動入力）</span>
              <button
                type="button"
                className="text-xs text-green-600 underline"
                onClick={() => { setSelectedRegion(""); setSelectedPrefecture(""); setSelectedCourseId(""); setCourseName(""); setIsCourseModalOpen(true); }}
              >
                変更
              </button>
            </div>
            <div>
              <label className="label">コース名 *</label>
              <input
                type="text"
                className="input"
                placeholder="コース名を入力"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                required
              />
            </div>
          </>
        )}
      </div>

      {/* ── ティーグランド選択（ゴルフ場選択時） ────────── */}
      {selectedCourseId && (
        <div>
          <label className="label">グリーン・ティー</label>
          {teesLoading ? (
            <p className="text-sm text-green-400">読み込み中...</p>
          ) : tees.length === 0 ? (
            <p className="text-sm text-green-400">ティー情報が登録されていません</p>
          ) : (
            <>
              <select
                className="input"
                value={selectedTeeId}
                onChange={(e) => setSelectedTeeId(e.target.value)}
              >
                {tees.map((t) => (
                  <option key={t.id} value={t.id}>{formatTeeLabel(t)}</option>
                ))}
              </select>
              {selectedTee && (selectedTee.course_rating != null || selectedTee.slope_rating != null) && (
                <p className="text-xs text-green-500 mt-1">
                  {selectedTee.course_rating != null && `コースレート: ${selectedTee.course_rating}`}
                  {selectedTee.course_rating != null && selectedTee.slope_rating != null && "　"}
                  {selectedTee.slope_rating  != null && `スロープレート: ${selectedTee.slope_rating}`}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 27H コース選択 ───────────────────────────────── */}
      {selectedCourseId && courseType === "27H" && sections.length > 0 && (
        <div className="space-y-3">
          <label className="label">コース選択（27H）</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-green-600 font-medium mb-1">前半（1〜9番）</p>
              <select
                className="input"
                value={outSection}
                onChange={(e) => {
                  setOutSection(e.target.value);
                  // IN が同じになってしまう場合は別のセクションを選ぶ
                  if (e.target.value === inSection) {
                    const alt = sections.find((s) => s !== e.target.value);
                    setInSection(alt ?? "");
                  }
                }}
              >
                {sections.map((s) => (
                  <option key={s} value={s}>{s}コース</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-green-600 font-medium mb-1">後半（10〜18番）</p>
              <select
                className="input"
                value={inSection}
                onChange={(e) => setInSection(e.target.value)}
              >
                {inSectionOptions.map((s) => (
                  <option key={s} value={s}>{s}コース</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── 36H コース選択 ───────────────────────────────── */}
      {selectedCourseId && courseType === "36H" && sections.length > 0 && (
        <div>
          <label className="label">コース選択（36H）</label>
          <select
            className="input"
            value={outSection}
            onChange={(e) => setOutSection(e.target.value)}
          >
            {sections.map((s) => (
              <option key={s} value={s}>{s}コース</option>
            ))}
          </select>
        </div>
      )}

      {/* ── プレー日 ─────────────────────────────────────── */}
      {/* pb-16: keeps the next field (スタートホール) clear of the iOS Safari
          Forms Assistant bar (≈44px) that appears above the date picker. */}
      <div className="pb-16">
        <label className="label">プレー日</label>
        <input
          type="date"
          className="input scroll-mb-24"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>

      {/* ── スタートホール ──────────────────────────────── */}
      {/* scroll-mt-24: when iOS auto-scrolls into this section after the
          date picker closes, leave room above so the buttons aren't sliced
          by the Forms Assistant bar. */}
      <div className="scroll-mt-24">
        <label className="label">スタートホール *</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {([1, 10] as StartHole[]).map((hole) => (
            <button
              key={hole}
              type="button"
              onClick={() => setStartHole(hole)}
              className={`py-3 rounded-xl border-2 font-bold text-sm transition-colors active:scale-95 ${
                startHole === hole
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
              }`}
            >
              {hole === 1 ? "アウト" : "イン"}
              <span className="block text-xs font-normal opacity-80">
                {hole === 1 ? "1番スタート" : "10番スタート"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 記録モード ────────────────────────────────────── */}
      <div>
        <label className="label">記録モード *</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {(["shot", "score"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-4 px-4 rounded-xl border-2 text-left transition-colors active:scale-95 ${
                mode === m
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-green-300"
              }`}
            >
              <span className="block font-bold text-sm">
                {m === "shot" ? "ショット記録" : "スコア記録"}
              </span>
              <span className="block text-xs opacity-75 mt-0.5 leading-tight">
                {m === "shot"
                  ? "打つ前にボタンを押してGPS記録"
                  : "ホール後にスコアを数字入力するだけ"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 天気・風 ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="label">天気・風（自動取得可）</span>
          {weatherStatus === "ok" && temperature !== null && (
            <span className="text-xs text-sky-600 font-medium">🌡 {temperature}°C</span>
          )}
        </div>

        {weatherStatus === "ok" ? (
          <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
            <span className="text-xs text-sky-700 font-medium">
              ✅ 現在地の天気を自動取得済み（手動変更も可）
            </span>
            <button type="button" onClick={() => setWeatherStatus("idle")}
              className="text-xs text-sky-500 underline ml-2">再取得</button>
          </div>
        ) : weatherStatus === "error" ? (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 gap-2">
            <button
              type="button"
              onClick={() => setShowGeoGuide(true)}
              className="flex-1 text-left text-xs text-amber-700 underline decoration-dotted"
            >
              ⚠️ 自動取得失敗 — タップで設定方法を確認
            </button>
            <button type="button" onClick={handleAutoWeather}
              className="text-xs text-amber-600 underline ml-2 whitespace-nowrap">再試行</button>
          </div>
        ) : autoLabel[weatherStatus] ? (
          <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
            <span className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs text-sky-700">{autoLabel[weatherStatus]}</span>
          </div>
        ) : (
          <button type="button" onClick={handleAutoWeather}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-sky-300
                       text-sky-600 text-sm font-medium hover:bg-sky-50 transition-colors active:scale-95">
            🌤 現在地の天気・風を自動入力
          </button>
        )}

        <div>
          <p className="text-xs text-green-600 font-medium mb-1.5">天気</p>
          <div className="grid grid-cols-4 gap-2">
            {WEATHER_OPTIONS.map((w) => (
              <ToggleButton key={w} label={w} selected={weather === w}
                onClick={() => setWeather(weather === w ? null : w)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-green-600 font-medium mb-1.5">風速</p>
          <div className="grid grid-cols-4 gap-2">
            {WIND_SPEED_OPTIONS.map((ws) => (
              <ToggleButton key={ws} label={ws} selected={windSpeed === ws}
                onClick={() => setWindSpeed(windSpeed === ws ? null : ws)} />
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-green-600 font-medium mb-1.5">風向き</p>
          {weatherStatus === "ok" && windDirection ? (
            <WindDirectionCompass direction={windDirection} />
          ) : (
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {compassGrid.flatMap((row, ri) =>
                row.map((dir, ci) =>
                  dir ? (
                    <ToggleButton key={dir} label={dir} selected={windDirection === dir}
                      onClick={() => setWindDirection(windDirection === dir ? null : dir)} />
                  ) : (
                    <div key={`empty-${ri}-${ci}`} />
                  )
                )
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={loading || !courseName}
      >
        {loading ? "作成中..." : "ラウンドを開始する"}
      </button>
    </form>
    {showGeoGuide && <GeoPermissionGuide onClose={() => setShowGeoGuide(false)} />}

    {/* ── ゴルフ場選択モーダル ──────────────────────────── */}
    {isCourseModalOpen && (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        onClick={() => setIsCourseModalOpen(false)}
      >
        <div
          className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ヘッダー */}
          <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-100">
            <h2 className="text-base font-bold text-green-800">ゴルフ場を選ぶ</h2>
            <button
              type="button"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
              onClick={() => setIsCourseModalOpen(false)}
            >
              ✕
            </button>
          </div>

          {/* ボディ（スクロール可能） */}
          <div className="p-4 overflow-y-auto flex-1 space-y-3">

            {/* ステップ1: 地域選択 */}
            {!selectedRegion && (
              <div className="flex flex-col gap-2">
                {REGION_PREFECTURES.map((r) => (
                  <button
                    key={r.region}
                    type="button"
                    className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-sm font-bold text-gray-700
                               hover:border-green-300 transition-colors active:scale-[0.98] text-left"
                    onClick={() => { setSelectedRegion(r.region); setSelectedPrefecture(""); setSelectedCourseId(""); setCourseName(""); }}
                  >
                    {r.region}
                  </button>
                ))}
                <button
                  type="button"
                  className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-gray-300 bg-white text-sm font-bold text-gray-400
                             hover:border-green-300 transition-colors active:scale-[0.98] text-left"
                  onClick={() => { setSelectedRegion("__manual__"); setSelectedPrefecture(""); setSelectedCourseId(""); setCourseName(""); setIsCourseModalOpen(false); }}
                >
                  指定なし（手動入力）
                </button>
              </div>
            )}

            {/* ステップ2: 県選択 */}
            {selectedRegion && selectedRegion !== "__manual__" && !selectedPrefecture && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-700 font-medium">{selectedRegion}</span>
                  <button
                    type="button"
                    className="text-xs text-green-600 underline"
                    onClick={() => { setSelectedRegion(""); setSelectedPrefecture(""); setSelectedCourseId(""); setCourseName(""); }}
                  >
                    ← 地域を選び直す
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {REGION_PREFECTURES.find((r) => r.region === selectedRegion)?.prefectures.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-sm font-bold text-gray-700
                                 hover:border-green-300 transition-colors active:scale-[0.98] text-left"
                      onClick={() => { setSelectedPrefecture(p); setSelectedCourseId(""); setCourseName(""); }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ステップ3: ゴルフ場選択 */}
            {selectedRegion && selectedRegion !== "__manual__" && selectedPrefecture && (() => {
              const filtered = courses.filter((c) => c.prefecture === selectedPrefecture);
              return (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-700 font-medium">{selectedRegion} &gt; {selectedPrefecture}</span>
                    <button
                      type="button"
                      className="text-xs text-green-600 underline"
                      onClick={() => { setSelectedPrefecture(""); setSelectedCourseId(""); setCourseName(""); }}
                    >
                      ← 県を選び直す
                    </button>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-sm text-green-500">この県のゴルフ場は準備中です</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {filtered.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-sm font-bold text-gray-700
                                     hover:border-green-300 transition-colors active:scale-[0.98] text-left"
                          onClick={() => { setSelectedCourseId(c.id); setCourseName(c.name); setIsCourseModalOpen(false); }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

          </div>
        </div>
      </div>
    )}
    </>
  );
}
