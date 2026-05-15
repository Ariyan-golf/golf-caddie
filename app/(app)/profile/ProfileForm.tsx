"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Category = "pro_coach" | "amateur";
type Gender = "male" | "female" | "undisclosed";

const CATEGORY_OPTIONS = [
  { value: "pro_coach", label: "プロ・コーチ" },
  { value: "amateur",   label: "アマチュア" },
] as const;

const GENDER_OPTIONS = [
  { value: "male",        label: "男性" },
  { value: "female",      label: "女性" },
  { value: "undisclosed", label: "未回答" },
] as const;

interface Props {
  displayName: string;
  initialCategory: string | null;
  initialBirthDate: string | null;
  initialGender: string | null;
}

export function ProfileForm({
  displayName,
  initialCategory,
  initialBirthDate,
  initialGender,
}: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<Category | "">(
    initialCategory === "pro_coach" || initialCategory === "amateur" ? initialCategory : ""
  );
  const [birthDate, setBirthDate] = useState(initialBirthDate ?? "");
  const [gender, setGender] = useState<Gender | "">(
    initialGender === "male" || initialGender === "female" || initialGender === "undisclosed"
      ? initialGender
      : ""
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const todayStr = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!category) { setError("カテゴリを選択してください"); return; }
    if (!birthDate) { setError("生年月日を入力してください"); return; }
    if (birthDate < "1900-01-01" || birthDate > todayStr) {
      setError("生年月日は1900年以降〜今日までで入力してください");
      return;
    }
    if (!gender) { setError("性別を選択してください"); return; }

    setLoading(true);
    const res = await fetch("/api/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, birth_date: birthDate, gender }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "更新に失敗しました");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    router.refresh();
  }

  const isIncomplete = !initialCategory || !initialBirthDate || !initialGender;

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      {displayName && (
        <div className="text-sm text-green-600">
          <span className="text-green-500">お名前：</span>
          <span className="font-semibold text-green-800">{displayName}</span>
        </div>
      )}

      {isIncomplete && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3 text-sm">
          ランキング集計のため、3項目すべての入力をお願いします。
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm">
          プロフィールを更新しました
        </div>
      )}

      {/* カテゴリ */}
      <div>
        <label className="label">カテゴリ</label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                category === opt.value
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-green-200 text-green-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 生年月日 */}
      <div>
        <label className="label">生年月日</label>
        <input
          type="date"
          className="input"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          required
          min="1900-01-01"
          max={todayStr}
        />
      </div>

      {/* 性別 */}
      <div>
        <label className="label">性別</label>
        <div className="grid grid-cols-3 gap-2">
          {GENDER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGender(opt.value)}
              className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors ${
                gender === opt.value
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-green-200 text-green-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-green-500">
          「未回答」を選んだ場合、月間ランキングの集計対象外となります
        </p>
      </div>

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? "更新中..." : "保存する"}
      </button>
    </form>
  );
}
