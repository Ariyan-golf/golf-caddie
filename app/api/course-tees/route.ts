import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const [{ data: course }, { data: tees }, { data: holeRows }] = await Promise.all([
    supabase
      .from("golf_courses")
      .select("id, name, address, course_type")
      .eq("id", courseId)
      .single(),
    supabase
      .from("course_tees")
      .select("id, green_type, tee_name, course_rating, slope_rating, distance, display_order")
      .eq("course_id", courseId)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("green_type")
      .order("tee_name"),
    supabase
      .from("course_holes")
      .select("course_section")
      .eq("course_id", courseId)
      .order("course_section"),
  ]);

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  // course_section の重複排除（27H/36H でセクション一覧を返す）
  const sections: string[] = [
    ...new Set((holeRows ?? []).map((r) => r.course_section as string)),
  ].filter((s) => s !== "").sort();

  return NextResponse.json({ course, tees: tees ?? [], sections });
}
