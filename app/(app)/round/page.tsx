import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { RoundListClient } from "./RoundListClient";

export default async function RoundListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, course_name, date, total_score")
    .eq("user_id", user!.id)
    .order("date", { ascending: false });

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="pt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-green-800">⛳ ラウンド</h1>
        <Link href="/round/new" className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-xl">
          + 新規
        </Link>
      </div>

      <RoundListClient rounds={rounds ?? []} />
    </div>
  );
}
