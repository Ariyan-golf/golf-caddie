import Link from "next/link";
import { QrScanner } from "./QrScanner";

interface Props {
  searchParams: Promise<{ course?: string }>;
}

export default async function GolfQrPage({ searchParams }: Props) {
  const { course } = await searchParams;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <h1 className="text-2xl font-bold text-green-800">⛳ 提携ゴルフ場と連携</h1>
        <p className="text-sm text-green-600 mt-1">QRコードをスキャンして330円をお支払いください</p>
      </div>

      <QrScanner initialCourse={course} />

      <Link href="/" className="block text-center text-sm text-green-500 underline">
        ホームに戻る
      </Link>
    </div>
  );
}
