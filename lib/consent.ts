import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal";

/**
 * ログイン中ユーザーが「最新版の利用規約・プライバシーポリシーに未同意」かを判定する。
 * 判定式：profile.terms_version !== TERMS_VERSION || profile.privacy_version !== PRIVACY_VERSION
 * （NULL含む）。既存ユーザー(NULL)・LINEユーザー(NULL)・将来の版改定（版違い）を1式で「要同意」に倒す。
 * 未ログイン・プロフィール未取得の場合は false（モーダルを出さない）。
 */
export async function getNeedsConsent(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("terms_version, privacy_version")
    .eq("id", user.id)
    .single();

  if (!data) return false;

  return (
    data.terms_version !== TERMS_VERSION ||
    data.privacy_version !== PRIVACY_VERSION
  );
}
