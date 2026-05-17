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
  const { data: { user } } = await supabase.auth.getUser();

  // 未ログイン: course_id を保持したままLINEログインへ誘導し、ログイン後に同じURLへ戻す
  if (!user) {
    const redirectTo = `/round/start?course_id=${course_id}`;
    const lineHref = `/auth/line?redirect_to=${encodeURIComponent(redirectTo)}`;

    return (
      <div className="min-h-screen px-4 pb-4 safe-area-top max-w-md mx-auto flex flex-col justify-center space-y-6">
        <div className="text-center space-y-2">
          <span className="text-5xl">⛳</span>
          <h1 className="text-2xl font-bold text-green-800">ラウンド開始</h1>
          <p className="text-sm text-green-600">まずLINEでログインしてください</p>
        </div>

        <Link
          href={lineHref}
          className="w-full py-3.5 rounded-xl text-base font-semibold text-white text-center
                     transition-colors hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#06C755" }}
        >
          LINEでログイン
        </Link>

        <p className="text-xs text-gray-400 text-center">
          ログイン後、自動的にこの画面に戻ります
        </p>
      </div>
    );
  }

  // ログイン済み: コース・ティー・セクション情報をまとめて取得
  const [{ data: course }, { data: tees }, { data: holeRows }] = await Promise.all([
    supabase
      .from("golf_courses")
      .select("id, name, course_type")
      .eq("id", course_id)
      .single(),
    supabase
      .from("course_tees")
      .select("id, green_type, tee_name, course_rating, slope_rating, distance")
      .eq("course_id", course_id)
      .order("green_type")
      .order("tee_name"),
    supabase
      .from("course_holes")
      .select("course_section")
      .eq("course_id", course_id)
      .order("course_section"),
  ]);

  if (!course) {
    return <ErrorView message="ゴルフ場が見つかりませんでした。QRコードを確認してください。" />;
  }

  const sections: string[] = [
    ...new Set((holeRows ?? []).map((r) => r.course_section as string)),
  ].filter((s) => s !== "").sort();

  const defaultTee = (tees ?? [])[0] ?? null;
  const courseType = course.course_type ?? "18H";
  let defaultOut = "";
  let defaultIn = "";
  if (courseType === "27H" && sections.length >= 2) {
    defaultOut = sections[0];
    defaultIn = sections[1];
  } else if (courseType === "36H" && sections.length >= 1) {
    defaultOut = sections[0];
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24 safe-area-top space-y-6">
      <div className="text-center space-y-2">
        <span className="text-5xl">⛳</span>
        <h1 className="text-2xl font-bold text-green-800">{course.name}</h1>
        <p className="text-sm text-green-600">QRコード読み込み完了</p>
      </div>
      <RoundStartConfirm
        courseId={course.id}
        courseName={course.name}
        courseType={courseType}
        tee={defaultTee}
        outSection={defaultOut}
        inSection={defaultIn}
      />
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
