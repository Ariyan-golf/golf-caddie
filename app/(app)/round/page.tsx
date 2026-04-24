import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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

      {rounds?.length ? (
        <div className="space-y-2">
          {rounds.map((round) => (
            <Link
              key={round.id}
              href={`/round/${round.id}`}
              className="card flex items-center justify-between hover:border-green-300 transition-colors"
            >
              <div>
                <p className="font-semibold text-green-800">{round.course_name}</p>
                <p className="text-sm text-green-500">{new Date(round.date).toLocaleDateString("ja-JP")}</p>
              </div>
              <div className="text-right">
                {round.total_score ? (
                  <span className="text-2xl font-bold text-green-700">{round.total_score}</span>
                ) : (
                  <span className="badge bg-yellow-100 text-yellow-700">進行中</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">⛳</p>
          <p className="text-green-600 font-medium">まだラウンドがありません</p>
          <p className="text-sm text-green-400 mt-1">新規ラウンドを開始しましょう</p>
          <Link href="/round/new" className="btn-primary mt-4 inline-block" style={{ width: "auto", paddingLeft: "2rem", paddingRight: "2rem" }}>
            ラウンド開始
          </Link>
        </div>
      )}
    </div>
  );
}
