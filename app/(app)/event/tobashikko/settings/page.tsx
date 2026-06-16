import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TobashikkoSettingsForm } from "./TobashikkoSettingsForm";

export const dynamic = "force-dynamic";

export default async function TobashikkoSettingsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nickname, age_group, gender, category, ranking_opt_in")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">飛ばしっこGO 参加設定</h1>
        <p className="text-sm text-green-600 mt-2 leading-relaxed">
          ランキングに表示する情報を設定します。一度設定すれば変更があるまで再入力は不要です。
        </p>
      </div>

      <TobashikkoSettingsForm
        initialNickname={profile?.nickname ?? ""}
        initialAgeGroup={profile?.age_group ?? null}
        initialGender={profile?.gender ?? null}
        initialCategory={profile?.category ?? null}
        initialRankingOptIn={profile?.ranking_opt_in ?? true}
      />
    </div>
  );
}
