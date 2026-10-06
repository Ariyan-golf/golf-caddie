-- security_definer_view 警告対応：未使用ビューの削除
-- active_beta_users はアプリ・DB関数・pg_cron のいずれからも参照されていない
drop view if exists public.active_beta_users;
