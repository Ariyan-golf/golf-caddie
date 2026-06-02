import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CompeResultClient } from "./CompeResultClient";
import type { DraconHole } from "../CompeHolesClient";

export const dynamic = "force-dynamic";

// 参加者向け読み取り専用の結果ページ。作成者 OR 参加者のみ閲覧可。
// 設定・削除など owner 専用UIは出さない。
export default async function CompeResultPage({
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
    .select("id, event_name, event_type, created_by, course_id, start_date")
    .eq("id", id)
    .maybeSingle();

  // 該当なし／comp 以外は一覧へ。
  if (!event || event.event_type !== "comp") {
    redirect("/compe");
  }

  // 認可：作成者 OR その event の参加者のみ。どちらでもなければ一覧へ。
  let allowed = event.created_by === user.id;
  if (!allowed) {
    const { data: part } = await supabase
      .from("event_participants")
      .select("user_id")
      .eq("event_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!part;
  }
  if (!allowed) {
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

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <CompeResultClient
          compe={{ id: event.id, event_name: event.event_name, start_date: event.start_date }}
          holes={(draconHoles ?? []) as DraconHole[]}
          courseName={courseName}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}
