import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  // middleware が認証検証済 → Cookie 読みのみの getSession() で高速化。
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, category, birth_date, gender")
    .eq("id", user!.id)
    .single();

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
      <div className="pt-4">
        <a href="/" className="flex items-center gap-1 text-green-600 text-sm font-medium mb-2">
          ← ホームに戻る
        </a>
        <h1 className="text-2xl font-bold text-green-800">プロフィール</h1>
        <p className="text-sm text-green-600 mt-1">
          月間ランキング「飛ばしっこごっこ」の集計に使用されます
        </p>
      </div>

      <ProfileForm
        displayName={profile?.display_name ?? ""}
        initialCategory={profile?.category ?? null}
        initialBirthDate={profile?.birth_date ?? null}
        initialGender={profile?.gender ?? null}
      />
    </div>
  );
}
