"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { REGION_PREFECTURES } from "@/lib/region-prefectures";

// ── 型定義（NewRoundForm から複製）──────────────────────────────────
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

interface Props {
  roundId: string;
  initialGolfCourseId: string | null;
  initialCourseName: string;
  initialCourseTeeId: string | null;
  initialOutSection: string;
  initialInSection: string;
}

type SupabaseClient = ReturnType<typeof createClient>;

// 設定したコースの「ホール番号 → 実パー」対応を course_holes から取得する。
// 対応関係は app/(app)/round/[id]/page.tsx の courseHoles 構築（49〜88行）を
// そのまま踏襲する:
//   18H : course_section = ''（hole_number そのまま）
//   36H : course_section = outSection（hole_number そのまま・18番分）
//   27H : 前半 = outSection の 1〜9番、後半 = inSection の 1〜9番を +9（10〜18番）
// 取得できたホールのみを Map に入れる（不明な番号には決して書き込まない安全側）。
async function fetchCoursePars(
  supabase: SupabaseClient,
  courseId: string,
  courseType: string,
  outSection: string,
  inSection: string,
): Promise<Map<number, number>> {
  const sel = "hole_number, par";
  const map = new Map<number, number>();

  if (courseType === "27H" && outSection && inSection) {
    const [{ data: outData }, { data: inData }] = await Promise.all([
      supabase.from("course_holes").select(sel)
        .eq("course_id", courseId).eq("course_section", outSection).order("hole_number"),
      supabase.from("course_holes").select(sel)
        .eq("course_id", courseId).eq("course_section", inSection).order("hole_number"),
    ]);
    for (const h of (outData ?? []) as { hole_number: number; par: number }[]) {
      map.set(h.hole_number, h.par);
    }
    for (const h of (inData ?? []) as { hole_number: number; par: number }[]) {
      map.set(h.hole_number + 9, h.par); // page.tsx と同じ +9 変換
    }
  } else if (courseType === "36H" && outSection) {
    const { data } = await supabase.from("course_holes").select(sel)
      .eq("course_id", courseId).eq("course_section", outSection).order("hole_number");
    for (const h of (data ?? []) as { hole_number: number; par: number }[]) {
      map.set(h.hole_number, h.par);
    }
  } else {
    // 18H（out/in セクション無し）
    const { data } = await supabase.from("course_holes").select(sel)
      .eq("course_id", courseId).eq("course_section", "").order("hole_number");
    for (const h of (data ?? []) as { hole_number: number; par: number }[]) {
      map.set(h.hole_number, h.par);
    }
  }

  return map;
}

// 既存ホール（par=4 等で作成済み）を、設定コースの実パーへ揃える。
// course_holes に対応パーが存在するホールのみ・現在値と異なるときのみ更新する。
// （該当が無いホールは据え置き＝誤った par を書かない）
async function applyCourseParsToHoles(
  supabase: SupabaseClient,
  roundId: string,
  parMap: Map<number, number>,
): Promise<void> {
  if (parMap.size === 0) return;

  const { data: existing } = await supabase
    .from("holes")
    .select("id, hole_number, par")
    .eq("round_id", roundId);

  for (const h of (existing ?? []) as { id: string; hole_number: number; par: number }[]) {
    const truePar = parMap.get(h.hole_number);
    if (typeof truePar !== "number") continue; // 対応パー無し → 据え置き
    if (h.par === truePar) continue;            // 既に正しい → スキップ
    await supabase.from("holes").update({ par: truePar }).eq("id", h.id);
  }
}

// TODO: 将来 CourseSelector として NewRoundForm と共通化
// （地域→県→ゴルフ場→ティー→セクション選択UI。現状は方針B＝複製。
//  NewRoundForm 312〜455行＋591〜709行＋144〜193行を流用・適応したもの）
export function RoundCourseEditor({
  roundId,
  initialGolfCourseId,
  initialCourseName,
  initialCourseTeeId,
  initialOutSection,
  initialInSection,
}: Props) {
  const router = useRouter();

  // ゴルフ場選択（3段階ドリルダウン）
  const [courses, setCourses]                     = useState<GolfCourse[]>([]);
  const [selectedRegion, setSelectedRegion]       = useState("");
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [selectedCourseId, setSelectedCourseId]   = useState(initialGolfCourseId ?? "");
  const [courseName, setCourseName]               = useState(initialCourseName);
  const [courseType, setCourseType]               = useState<string>("18H");
  const [isModalOpen, setIsModalOpen]             = useState(false);

  // ティー
  const [tees, setTees]                   = useState<CourseTee[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState(initialCourseTeeId ?? "");
  const [teesLoading, setTeesLoading]     = useState(false);

  // コース選択（27H/36H）
  const [sections, setSections]   = useState<string[]>([]);
  const [outSection, setOutSection] = useState(initialOutSection);
  const [inSection, setInSection]   = useState(initialInSection);

  // 保存状態
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  // 登録済みゴルフ場を初回ロード（NewRoundForm 134〜141行 相当）
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("golf_courses")
      .select("id, name, region, prefecture, name_kana")
      .order("name_kana", { nullsFirst: false })
      .then(({ data }) => setCourses(data ?? []));
  }, []);

  // ゴルフ場選択時 → ティー・セクション取得＆コース名自動入力
  // （NewRoundForm 144〜182行 相当。/api/course-tees を再利用）
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

  // NewRoundForm 186〜193行 相当
  function formatTeeLabel(t: CourseTee) {
    let label = `${t.green_type} / ${t.tee_name}`;
    const parts: string[] = [];
    if (t.course_rating != null) parts.push(`CR:${t.course_rating}`);
    if (t.slope_rating  != null) parts.push(`SR:${t.slope_rating}`);
    if (parts.length > 0) label += `（${parts.join(" / ")}）`;
    return label;
  }

  // 27H の IN セクション候補（OUT で選んだものを除外）
  const inSectionOptions = sections.filter((s) => s !== outSection);

  async function handleSave() {
    if (!selectedCourseId) return; // 実コースの紐付けが目的（手動入力モードは無し）
    setSaving(true);
    setError("");

    const supabase = createClient();
    const { error: err } = await supabase
      .from("rounds")
      .update({
        golf_course_id: selectedCourseId,
        course_name:    courseName,
        course_tee_id:  selectedTee?.id ?? null,
        course_rating:  selectedTee?.course_rating ?? null,
        slope_rating:   selectedTee?.slope_rating ?? null,
        out_section:    outSection || null,
        in_section:     inSection  || null,
      })
      .eq("id", roundId);

    if (err) {
      setError("ゴルフ場の設定に失敗しました");
      setSaving(false);
      return;
    }

    // ── 既存ホールの par を実コースの実パーへ上書き ────────────────────
    // 未選択中に par=4 で作成済みのホールを、設定コースの正しいパーへ揃える。
    // par は販売データの土台のため、対応が取れるホールだけを安全に更新する。
    // ここでの失敗はラウンド設定（rounds の UPDATE）の成否に影響させない。
    try {
      const parMap = await fetchCoursePars(
        supabase,
        selectedCourseId,
        courseType,
        outSection,
        inSection,
      );
      await applyCourseParsToHoles(supabase, roundId, parMap);
    } catch {
      // par 上書きの失敗は無視（rounds 設定自体は成功扱いで先へ進む）
    }

    setIsModalOpen(false);
    setSaving(false);
    router.refresh(); // サーバーページ page.tsx を再取得 → courseHoles / greenCenters を反映
  }

  // 既にゴルフ場が設定済みのラウンドでは何も表示しない（要件3）
  if (initialGolfCourseId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="mt-1 text-sm font-medium text-green-600 underline
                   hover:text-green-700 transition-colors active:scale-95"
      >
        ⛳ ゴルフ場を設定
      </button>

      {/* ── ゴルフ場選択モーダル（NewRoundForm 591〜709行 を適応）─────── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー（固定・スクロールしない） */}
            <div className="flex items-center justify-between p-4 pb-3 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-bold text-green-800">ゴルフ場を設定</h2>
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                ✕
              </button>
            </div>

            {/* ボディ（min-h-0 でスクロール可能に。最下部はナビバー＋セーフエリア分の余白） */}
            <div className="px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+5rem)] overflow-y-auto flex-1 min-h-0 space-y-3">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
                  {error}
                </div>
              )}

              {/* ステップ1: 地域選択 */}
              {!selectedCourseId && !selectedRegion && (
                <div className="flex flex-col gap-2">
                  {REGION_PREFECTURES.map((r) => (
                    <button
                      key={r.region}
                      type="button"
                      className="w-full py-3 px-4 rounded-xl border-2 border-gray-200 bg-white text-sm font-bold text-gray-700
                                 hover:border-green-300 transition-colors active:scale-[0.98] text-left"
                      onClick={() => { setSelectedRegion(r.region); setSelectedPrefecture(""); }}
                    >
                      {r.region}
                    </button>
                  ))}
                </div>
              )}

              {/* ステップ2: 県選択 */}
              {!selectedCourseId && selectedRegion && !selectedPrefecture && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-700 font-medium">{selectedRegion}</span>
                    <button
                      type="button"
                      className="text-xs text-green-600 underline"
                      onClick={() => { setSelectedRegion(""); setSelectedPrefecture(""); }}
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
                        onClick={() => setSelectedPrefecture(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* ステップ3: ゴルフ場選択 */}
              {!selectedCourseId && selectedRegion && selectedPrefecture && (() => {
                const filtered = courses.filter((c) => c.prefecture === selectedPrefecture);
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-700 font-medium">{selectedRegion} &gt; {selectedPrefecture}</span>
                      <button
                        type="button"
                        className="text-xs text-green-600 underline"
                        onClick={() => setSelectedPrefecture("")}
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
                            onClick={() => { setSelectedCourseId(c.id); setCourseName(c.name); }}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* ステップ4: ティー・セクション選択 ＆ 保存（コース確定後）*/}
              {selectedCourseId && (
                <div className="space-y-4">
                  {/* 選択確定表示 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-green-700 font-medium">{courseName}</span>
                    <button
                      type="button"
                      className="text-xs text-green-600 underline"
                      onClick={() => { setSelectedCourseId(""); setCourseName(""); }}
                    >
                      選び直す
                    </button>
                  </div>

                  {/* ティーグランド選択（NewRoundForm 370〜399行 相当）*/}
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

                  {/* 27H コース選択（NewRoundForm 401〜439行 相当）*/}
                  {courseType === "27H" && sections.length > 0 && (
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

                  {/* 36H コース選択（NewRoundForm 441〜455行 相当）*/}
                  {courseType === "36H" && sections.length > 0 && (
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

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? "保存中..." : "このゴルフ場で設定する"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
