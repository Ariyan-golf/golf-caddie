"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AgeGroup = "20s" | "30s" | "40s" | "50s" | "60plus";
type Gender   = "male" | "female" | "undisclosed";
type Category = "amateur" | "pro_coach";

const AGE_OPTIONS = [
  { value: "20s",    label: "20代" },
  { value: "30s",    label: "30代" },
  { value: "40s",    label: "40代" },
  { value: "50s",    label: "50代" },
  { value: "60plus", label: "60代以上" },
] as const;

const GENDER_OPTIONS = [
  { value: "male",        label: "男性" },
  { value: "female",      label: "女性" },
  { value: "undisclosed", label: "回答しない" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "amateur",   label: "アマチュア" },
  { value: "pro_coach", label: "プロ・コーチ" },
] as const;

interface Props {
  initialNickname:    string;
  initialAgeGroup:    string | null;
  initialGender:      string | null;
  initialCategory:    string | null;
  initialRankingOptIn: boolean;
}

export function TobashikkoSettingsForm({
  initialNickname,
  initialAgeGroup,
  initialGender,
  initialCategory,
  initialRankingOptIn,
}: Props) {
  const router = useRouter();

  const [nickname, setNickname] = useState(initialNickname);
  const [rankingOptIn, setRankingOptIn] = useState(initialRankingOptIn);
  const [ageGroup, setAgeGroup] = useState<AgeGroup | "">(
    AGE_OPTIONS.some((o) => o.value === initialAgeGroup) ? (initialAgeGroup as AgeGroup) : ""
  );
  const [gender, setGender] = useState<Gender | "">(
    GENDER_OPTIONS.some((o) => o.value === initialGender) ? (initialGender as Gender) : ""
  );
  const [category, setCategory] = useState<Category>(
    initialCategory === "pro_coach" ? "pro_coach" : "amateur"
  );

  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const trimmed = nickname.trim();
    if (!trimmed) { setError("ニックネームを入力してください"); return; }
    if (!ageGroup || !gender) { setError("すべて選択してください"); return; }

    setLoading(true);
    const res = await fetch("/api/profile/tobashikko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname:       trimmed,
        age_group:      ageGroup,
        gender,
        category,
        ranking_opt_in: rankingOptIn,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "保存に失敗しました");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    router.refresh();
    setTimeout(() => router.push("/"), 800);
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm">
          設定を保存しました
        </div>
      )}

      {/* ニックネーム */}
      <div>
        <label className="label">ニックネーム</label>
        <input
          type="text"
          className="input"
          placeholder="ランキングに表示される名前"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
        />
        <p className="mt-1 text-xs text-green-500">
          本名でなくてOK。ランキングはこの名前で公開されます
        </p>
      </div>

      {/* 年代 */}
      <div>
        <label className="label">年代</label>
        <div className="grid grid-cols-3 gap-2">
          {AGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAgeGroup(opt.value)}
              className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                ageGroup === opt.value
                  ? "bg-green-600 border-green-600 text-white"
                  : "bg-white border-green-200 text-green-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
      </div>

      {/* 区分 */}
      <div>
        <label className="label">区分</label>
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

      {/* 全国ランキングに参加する */}
      <div>
        <label className="label">全国ランキングに参加する</label>
        <button
          type="button"
          role="switch"
          aria-checked={rankingOptIn}
          onClick={() => setRankingOptIn((v) => !v)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
            rankingOptIn ? "bg-green-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              rankingOptIn ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <p className="mt-1 text-xs text-green-500">
          OFFにすると公開ランキングに名前が出ません。記録やランキング閲覧は引き続きできます
        </p>
      </div>

      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? "保存中..." : "設定を保存"}
      </button>
    </form>
  );
}
