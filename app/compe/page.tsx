import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CompeClient, type CompeRow } from "./CompeClient";

export const dynamic = "force-dynamic";

export default async function CompePage() {
  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect("/login");

  const { data: compeRows } = await supabase
    .from("events")
    .select("id, event_name, event_code, start_date")
    .eq("event_type", "comp")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  const initialCompes: CompeRow[] = (compeRows ?? []).map((c) => ({
    id:         c.id,
    event_name: c.event_name,
    event_code: c.event_code,
    start_date: c.start_date,
  }));

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <div className="pt-4">
          <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
            ← ホームに戻る
          </a>
          <h1 className="text-2xl font-bold text-green-800">コンペ幹事ページ</h1>
          <p className="text-sm text-green-600 mt-1 leading-relaxed">
            コンペを作成して、参加者に参加コードを共有しましょう。
          </p>
        </div>

        <CompeClient initialCompes={initialCompes} />
      </div>
    </div>
  );
}
