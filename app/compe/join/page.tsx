import { createClient } from "@/lib/supabase/server";
import { CompeJoinLanding } from "./CompeJoinLanding";

export const dynamic = "force-dynamic";

export default async function CompeJoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = "" } = await searchParams;
  const normalizedCode = code.trim().toUpperCase().slice(0, 6);

  // このルートは middleware の openPaths に入っており、未ログインでも描画される。
  // ここでログイン状態を判定してクライアントに渡す（Cookie 読みのみの getSession）。
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <div className="pt-4">
          <h1 className="text-2xl font-bold text-green-800">コンペに参加</h1>
        </div>
        <CompeJoinLanding code={normalizedCode} isLoggedIn={isLoggedIn} />
      </div>
    </div>
  );
}
