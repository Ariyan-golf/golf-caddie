"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import LineLoginButton from "@/components/LineLoginButton";

const INVITE_CODE_MAP: Record<string, { graduation_year: number }> = {
  TOKAI2026: { graduation_year: 2026 },
  TOKAI2027: { graduation_year: 2027 },
  TOKAI2028: { graduation_year: 2028 },
  TOKAI2029: { graduation_year: 2029 },
};

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

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inviteInfo = INVITE_CODE_MAP[inviteCode.toUpperCase()] ?? null;
  const todayStr = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!category) {
      setError("カテゴリを選択してください");
      return;
    }
    if (!birthDate) {
      setError("生年月日を入力してください");
      return;
    }
    if (birthDate < "1900-01-01" || birthDate > todayStr) {
      setError("生年月日は1900年以降〜今日までで入力してください");
      return;
    }
    if (!gender) {
      setError("性別を選択してください");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const normalizedCode = inviteCode.trim().toUpperCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          category,
          birth_date: birthDate,
          gender,
          ...(normalizedCode ? { invite_code: normalizedCode } : {}),
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError("登録完了後の自動ログインに失敗しました。ログインページからサインインしてください。");
        setLoading(false);
        return;
      }
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⛳</span>
          </div>
          <h1 className="text-2xl font-bold text-green-800">Golf Caddie AI</h1>
          <p className="text-green-600 text-sm mt-1">無料で始める</p>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-green-800 mb-4">新規登録</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">お名前</label>
              <input
                type="text"
                className="input"
                placeholder="山田 太郎"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">メールアドレス</label>
              <input
                type="email"
                className="input"
                placeholder="golf@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label">パスワード（6文字以上）</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

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

            {/* 招待コード */}
            <div>
              <label className="label">
                招待コード
                <span className="text-green-400 font-normal ml-1">（任意）</span>
              </label>
              <input
                type="text"
                className="input"
                placeholder="例：TOKAI2026"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
              />
              {inviteCode && inviteInfo && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl p-3 text-sm space-y-0.5">
                  <p className="text-green-700 font-semibold">招待コードを確認しました</p>
                  <p className="text-green-600">ロール：学生（student）</p>
                  <p className="text-green-600">卒業予定年度：{inviteInfo.graduation_year}年</p>
                </div>
              )}
              {inviteCode && !inviteInfo && (
                <p className="mt-1 text-xs text-red-500">無効な招待コードです</p>
              )}
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "登録中..." : "アカウント作成"}
            </button>
          </form>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3 my-4">
            <hr className="flex-1 border-green-200" />
            <span className="text-xs text-green-500">または</span>
            <hr className="flex-1 border-green-200" />
          </div>
          <LineLoginButton />
        </div>

        <p className="text-center text-sm text-green-600 mt-4">
          すでにアカウントをお持ちの方は{" "}
          <Link href="/login" className="font-semibold text-green-700 underline">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
