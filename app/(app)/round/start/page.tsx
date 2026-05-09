import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { RoundStartConfirm } from "./RoundStartConfirm";

interface Props {
  searchParams: Promise<{ course_id?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RoundStartPage({ searchParams }: Props) {
  const { course_id } = await searchParams;

  if (!course_id || !UUID_RE.test(course_id)) {
    return <ErrorView message="無効なQRコードです（course_id が指定されていません）。" />;
  }

  const supabase = await createClient();
  const { data: course } = await supabase
    .from("golf_courses")
    .select("id, name, course_type")
    .eq("id", course_id)
    .single();

  if (!course) {
    return <ErrorView message="ゴルフ場が見つかりませんでした。QRコードを確認してください。" />;
  }

  return (
    <div className="max-w-lg mx-auto p-4 pt-8 space-y-6 pb-24">
      <div className="text-center space-y-2">
        <span className="text-5xl">⛳</span>
        <h1 className="text-2xl font-bold text-green-800">{course.name}</h1>
        <p className="text-sm text-green-600">QRコード読み込み完了</p>
      </div>
      <RoundStartConfirm courseId={course.id} courseName={course.name} />
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="max-w-lg mx-auto p-4 pt-12 space-y-4">
      <div className="card space-y-3 text-center">
        <span className="text-4xl">⚠️</span>
        <p className="text-sm text-red-600">{message}</p>
        <Link href="/" className="block text-sm text-green-600 underline">
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
