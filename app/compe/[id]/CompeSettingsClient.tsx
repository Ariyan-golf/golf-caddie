"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
}: {
  id:         string;
  course_id:  string | null;
  start_date: string;
}) {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(course_id ?? "");
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
      .then(({ data }) => setCourses(data ?? []));
  }, []);

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

      <div>
        <label className="label">ゴルフ場</label>
        <select
          className="input"
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
        >
          <option value="">コースを指定しない（未登録コース）</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
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
