import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ADMIN_EMAIL = "t.a.0903076959@i.softbank.jp";

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = adminDb();
  const { data: courses, error } = await admin
    .from("golf_courses")
    .select("*, course_holes(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ courses: courses ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = adminDb();
  const body = await req.json();
  const { name, address, localRules, teeNames, holes, tees } = body as {
    name: string;
    address: string;
    localRules: string;
    teeNames: [string, string, string, string];
    holes: {
      hole_number: number;
      par: number;
      hdcp: number | null;
      distance_tee1: number | null;
      distance_tee2: number | null;
      distance_tee3: number | null;
      distance_tee4: number | null;
    }[];
    tees?: {
      green_type: string;
      tee_name: string;
      course_rating: number | null;
      slope_rating: number | null;
      distance: number | null;
    }[];
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "ゴルフ場名は必須です" }, { status: 400 });
  }

  const { data: course, error: courseErr } = await admin
    .from("golf_courses")
    .insert({
      name: name.trim(),
      address: address?.trim() || null,
      local_rules: localRules?.trim() || null,
      tee1_name: teeNames?.[0]?.trim() || "ティー1",
      tee2_name: teeNames?.[1]?.trim() || "ティー2",
      tee3_name: teeNames?.[2]?.trim() || "ティー3",
      tee4_name: teeNames?.[3]?.trim() || "ティー4",
    })
    .select()
    .single();

  if (courseErr || !course) {
    return NextResponse.json({ error: courseErr?.message ?? "登録に失敗しました" }, { status: 500 });
  }

  const holeRows = holes.map((h) => ({
    course_id: course.id,
    hole_number: h.hole_number,
    par: h.par,
    hdcp: h.hdcp || null,
    distance_tee1: h.distance_tee1 || null,
    distance_tee2: h.distance_tee2 || null,
    distance_tee3: h.distance_tee3 || null,
    distance_tee4: h.distance_tee4 || null,
  }));

  const { error: holesErr } = await admin.from("course_holes").insert(holeRows);
  if (holesErr) {
    await admin.from("golf_courses").delete().eq("id", course.id);
    return NextResponse.json({ error: holesErr.message }, { status: 500 });
  }

  if (tees && tees.length > 0) {
    const teeRows = tees.map((t) => ({
      course_id:     course.id,
      green_type:    t.green_type,
      tee_name:      t.tee_name,
      course_rating: t.course_rating ?? null,
      slope_rating:  t.slope_rating ?? null,
      distance:      t.distance ?? null,
    }));
    const { error: teesErr } = await admin.from("course_tees").insert(teeRows);
    if (teesErr) {
      await admin.from("golf_courses").delete().eq("id", course.id);
      return NextResponse.json({ error: teesErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ course });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = adminDb();
  const { courseId } = await req.json() as { courseId?: string };
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  // course_holes は ON DELETE CASCADE で自動削除される
  const { error } = await admin.from("golf_courses").delete().eq("id", courseId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
