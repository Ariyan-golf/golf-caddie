"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REGION_PREFECTURES } from "@/lib/region-prefectures";

interface CourseRow {
  id:         string;
  name:       string;
  region:     string | null;
  prefecture: string | null;
  name_kana:  string | null;
}

export function CompeSettingsClient({
  id,
  course_id,
  start_date,
  onSaved,
}: {
  id:         string;
  course_id:  string | null;
  start_date: string;
  onSaved?: (info: { courseName: string | null; date: string }) => void;
}) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(course_id ?? "");
  // 地域・県は保存対象ではなくゴルフ場を絞り込むためのナビゲーション用 state。
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedPrefecture, setSelectedPrefecture] = useState("");
  const [date, setDate] = useState(start_date ?? "");
  // 保存済みの内容（baseline）。現在の入力と比較して変更ありかを判定する。
  const [savedCourseId, setSavedCourseId] = useState(course_id ?? "");
  const [savedDate, setSavedDate] = useState(start_date ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const isDirty = selectedCourseId !== savedCourseId || date !== savedDate;

  // 登録済みゴルフ場を初回ロード（round/new と同じ取得方法）。
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("golf_courses")
      .select("id, name, region, prefecture, name_kana")
      .order("name_kana", { nullsFirst: false })
      .then(({ data }) => {
        const list = data ?? [];
        setCourses(list);
        // 保存済み course_id があれば地域・県を復元。無ければ「未登録」状態を初期選択。
        if (course_id) {
          const c = list.find((x) => x.id === course_id);
          if (c) {
            setSelectedRegion(c.region ?? "");
            setSelectedPrefecture(c.prefecture ?? "");
          }
        } else {
          setSelectedRegion("__none__");
        }
      });
  }, [course_id]);

  async function handleSave() {
    setMessage(null);
    if (!date) {
      setMessage({ type: "error", text: "開催日を選択してください" });
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/compe/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: selectedCourseId || null, date }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "保存に失敗しました" });
      setSaving(false);
      return;
    }

    setMessage({ type: "ok", text: "保存しました" });
    setSaving(false);
    // baseline を現在値に更新 → isDirty=false（「✓ 保存済」表示）に戻る。
    setSavedCourseId(selectedCourseId);
    setSavedDate(date);
    // 親（概要カード・ランキング）へ保存後のコース名・開催日を通知。
    const courseName = selectedCourseId
      ? courses.find((c) => c.id === selectedCourseId)?.name ?? null
      : null;
    onSaved?.({ courseName, date });
  }

  return (
    <div className="card space-y-4">
      <h2 className="font-semibold text-green-800">ゴルフ場・開催日</h2>

      {message && (
        <div
          className={
            message.type === "ok"
              ? "bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm"
              : "bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm"
          }
        >
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {/* 地域（先頭は「指定しない＝未登録コース」） */}
        <div>
          <label className="label">地域</label>
          <select
            className="input"
            value={selectedRegion}
            onChange={(e) => {
              setSelectedRegion(e.target.value);
              setSelectedPrefecture("");
              setSelectedCourseId("");
            }}
          >
            <option value="__none__">コースを指定しない（未登録コース）</option>
            {REGION_PREFECTURES.map((r) => (
              <option key={r.region} value={r.region}>
                {r.region}
              </option>
            ))}
          </select>
        </div>

        {selectedRegion === "__none__" && (
          <p className="text-xs text-green-500">未登録コースとして進めます</p>
        )}

        {/* 県（地域選択時のみ） */}
        {selectedRegion && selectedRegion !== "__none__" && (
          <div>
            <label className="label">県</label>
            <select
              className="input"
              value={selectedPrefecture}
              onChange={(e) => {
                setSelectedPrefecture(e.target.value);
                setSelectedCourseId("");
              }}
            >
              <option value="">県を選択</option>
              {REGION_PREFECTURES.find((r) => r.region === selectedRegion)?.prefectures.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ゴルフ場（県選択時のみ） */}
        {selectedRegion && selectedRegion !== "__none__" && selectedPrefecture && (() => {
          const filtered = courses.filter((c) => c.prefecture === selectedPrefecture);
          return (
            <div>
              <label className="label">ゴルフ場</label>
              {filtered.length === 0 ? (
                <p className="text-sm text-green-500">この県のゴルフ場は準備中です</p>
              ) : (
                <select
                  className="input"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                >
                  <option value="">ゴルフ場を選択</option>
                  {filtered.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })()}
      </div>

      <div>
        <label className="label">開催日</label>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <button
        onClick={handleSave}
        className={`btn-primary w-full ${!isDirty ? "bg-green-100 text-green-700" : ""}`}
        disabled={saving || !isDirty}
      >
        {saving ? "保存中..." : isDirty ? "保存" : "✓ 保存済"}
      </button>
    </div>
  );
}
