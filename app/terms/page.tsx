import Link from "next/link";
import { TERMS_TEXT } from "@/lib/legal";

export const metadata = { title: "利用規約 | Golf Caddie AI" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/login"
          className="text-green-600 text-sm font-medium active:text-green-800"
        >
          ← 戻る
        </Link>
        <h1 className="text-2xl font-bold text-green-800 mt-2 mb-4">利用規約</h1>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {TERMS_TEXT}
        </p>
      </div>
    </main>
  );
}
