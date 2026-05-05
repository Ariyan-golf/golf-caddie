import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get("courseId");
  if (!courseId) return NextResponse.json({ error: "courseId required" }, { status: 400 });

  const [{ data: course }, { data: tees }] = await Promise.all([
    supabase.from("golf_courses").select("id, name, address").eq("id", courseId).single(),
    supabase
      .from("course_tees")
      .select("id, green_type, tee_name, course_rating, slope_rating, distance")
      .eq("course_id", courseId)
      .order("green_type")
      .order("tee_name"),
  ]);

  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  return NextResponse.json({ course, tees: tees ?? [] });
}
