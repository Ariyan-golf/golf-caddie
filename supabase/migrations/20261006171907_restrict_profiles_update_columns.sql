-- profiles の書き換え制限（許可リスト方式）
-- 本人が書き換えてよい列だけ authenticated に UPDATE 権限を付与し、それ以外の列は拒否する。
-- role / plan / is_beta_user / beta_expires_at / day_pass_date / round_count /
-- referral_code / invite_code / cancelled_at 等は service role と security definer 関数のみが更新する。
-- 将来追加する列は、ここに明示的に grant しない限り本人からは更新できない。

-- ① テーブル全体の UPDATE 権限を取り消す
revoke update on public.profiles from anon, authenticated;

-- ② 本人が書き換えてよい列だけ許可する
--   display_name                      : ホーム初回表示時の表示名補完（app/page.tsx）
--   category / birth_date / gender    : プロフィール編集（api/profile/update）
--   nickname / age_group / ranking_opt_in : 飛ばしっこ設定（api/profile/tobashikko）
--   terms_* / privacy_*               : 規約同意（api/consent）
grant update (
  display_name,
  category,
  birth_date,
  gender,
  nickname,
  age_group,
  ranking_opt_in,
  terms_version,
  terms_agreed_at,
  privacy_version,
  privacy_agreed_at
) on public.profiles to authenticated;

-- ③ 全ロールに insert を許していたポリシーを削除する
--   プロフィール作成は handle_new_user（security definer）と service role のみが行う
drop policy if exists "Service role can insert profiles" on public.profiles;
