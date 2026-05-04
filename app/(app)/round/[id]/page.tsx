import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { HoleRecorder } from "@/components/HoleRecorder";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoundDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: round } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!round) notFound();

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
      />
    </div>
  );
}
