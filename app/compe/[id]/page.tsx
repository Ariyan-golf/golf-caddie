import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CompeDetailClient, type CompeDetail } from "./CompeDetailClient";

export const dynamic = "force-dynamic";

export default async function CompeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect("/login");

  const { data: event } = await supabase
    .from("events")
    .select("id, event_name, event_code, start_date, end_date, course_id, event_type, created_by")
    .eq("id", id)
    .maybeSingle();

  // 該当なし／comp 以外／自分が作成したコンペでない場合は一覧へ戻す。
  if (!event || event.event_type !== "comp" || event.created_by !== user.id) {
    redirect("/compe");
  }

  // ドラコン対象ホール（最大4・各ドラコン/逆ドラコン）。
  const { data: draconHoles } = await supabase
    .from("event_dracon_holes")
    .select("hole_number, mode")
    .eq("event_id", id)
    .order("hole_number");

  // コース名（course_id 指定時のみ。golf_courses は全認証ユーザー読み取り可）。
  let courseName: string | null = null;
  if (event.course_id) {
    const { data: course } = await supabase
      .from("golf_courses")
      .select("name")
      .eq("id", event.course_id)
      .maybeSingle();
    courseName = course?.name ?? null;
  }

  const compe: CompeDetail = {
    id:         event.id,
    event_name: event.event_name,
    event_code: event.event_code,
    start_date: event.start_date,
    end_date:   event.end_date,
    course_id:  event.course_id,
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <CompeDetailClient compe={compe} holes={draconHoles ?? []} courseName={courseName} currentUserId={user.id} />
      </div>
    </div>
  );
}
