import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { HoleRecorder } from "@/components/HoleRecorder";

interface Props {
  params: Promise<{ id: string }>;
}

interface CourseHole {
  hole_number: number;
  par: number;
}

export default async function RoundDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: round } = await supabase
    .from("rounds")
    .select("*, golf_courses(course_type)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!round) notFound();

  const courseType: string = (round.golf_courses as { course_type?: string } | null)?.course_type ?? "18H";

  // ── courseHoles をコースタイプ・セクションに応じて構築 ──────────────
  let courseHoles: CourseHole[] | undefined;

  if (round.golf_course_id) {
    if (courseType === "27H" && round.out_section && round.in_section) {
      // 27H: 前半（outSection 1-9番）＋ 後半（inSection 1-9番 → 10-18番に変換）
      const [{ data: outData }, { data: inData }] = await Promise.all([
        supabase
          .from("course_holes")
          .select("hole_number, par")
          .eq("course_id", round.golf_course_id)
          .eq("course_section", round.out_section)
          .order("hole_number"),
        supabase
          .from("course_holes")
          .select("hole_number, par")
          .eq("course_id", round.golf_course_id)
          .eq("course_section", round.in_section)
          .order("hole_number"),
      ]);
      courseHoles = [
        ...(outData ?? []),
        ...(inData ?? []).map((h) => ({ ...h, hole_number: h.hole_number + 9 })),
      ];
    } else if (courseType === "36H" && round.out_section) {
      // 36H: 選択したコース（18番分）
      const { data } = await supabase
        .from("course_holes")
        .select("hole_number, par")
        .eq("course_id", round.golf_course_id)
        .eq("course_section", round.out_section)
        .order("hole_number");
      courseHoles = data ?? undefined;
    } else {
      // 18H: course_section = '' のホールを取得
      const { data } = await supabase
        .from("course_holes")
        .select("hole_number, par")
        .eq("course_id", round.golf_course_id)
        .eq("course_section", "")
        .order("hole_number");
      courseHoles = data ?? undefined;
    }
  }

  const { data: holes } = await supabase
    .from("holes")
    .select("*, shots(*)")
    .eq("round_id", id)
    .order("hole_number");

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-green-800">{round.course_name}</h1>
          <p className="text-sm text-green-500">
            {new Date(round.date).toLocaleDateString("ja-JP")}
            {round.total_score && (
              <span className="ml-2 font-bold text-green-700">{round.total_score}打</span>
            )}
          </p>
        </div>
      </div>

      <HoleRecorder
        roundId={id}
        initialHoles={holes ?? []}
        startHole={round.start_hole ?? 1}
        mode={(round.mode ?? "shot") as "shot" | "score"}
        windDirection={round.wind_direction ?? null}
        windSpeed={round.wind_speed ?? null}
        courseRating={round.course_rating ?? null}
        slopeRating={round.slope_rating ?? null}
        courseHoles={courseHoles}
        paymentStatus={(round.payment_status ?? "paid") as "pending" | "paid"}
        golfCourseName={round.course_name ?? ""}
      />
    </div>
  );
}
