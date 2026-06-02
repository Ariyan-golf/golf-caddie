import Link from "next/link";
import { PRIVACY_TEXT } from "@/lib/legal";

export const metadata = { title: "プライバシーポリシー | Golf Caddie AI" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/login"
          className="text-green-600 text-sm font-medium active:text-green-800"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-green-800 mt-2 mb-4">プライバシーポリシー</h1>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {PRIVACY_TEXT}
        </p>
      </div>
    </main>
  );
}
