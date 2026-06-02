"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ConsentGate({ needsConsent }: { needsConsent: boolean }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!needsConsent) return null;

  async function handleAgree() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/consent", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "同意の記録に失敗しました。時間をおいて再度お試しください。");
        setLoading(false);
        return;
      }
      // サーバー再評価で needsConsent=false になりモーダルが消える
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
      setLoading(false);
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm card max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-green-800 mb-3">
          利用規約・プライバシーポリシーへの同意のお願い
        </h2>

        <p className="text-sm text-green-700 leading-relaxed mb-4">
          利用規約とプライバシーポリシーをご確認のうえ、同意いただくと引き続き
          Golf Caddie AI をご利用いただけます。
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* 利用規約・プライバシーポリシーへの同意（必須）— register/page.tsx と同じ markup */}
        <label className="flex items-start gap-2 text-sm text-green-700 mb-4">
          <input
            type="checkbox"
            className="mt-0.5 flex-shrink-0"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            <Link href="/terms" target="_blank" rel="noopener" className="text-green-700 underline">利用規約</Link>
            ・
            <Link href="/privacy" target="_blank" rel="noopener" className="text-green-700 underline">プライバシーポリシー</Link>
            に同意します
          </span>
        </label>

        <button
          type="button"
          className="btn-primary"
          onClick={handleAgree}
          disabled={loading || !agreed}
        >
          {loading ? "送信中..." : "同意して続ける"}
        </button>

        <div className="text-center mt-3">
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-green-400 hover:text-red-500 transition-colors font-medium px-1 py-0.5"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
