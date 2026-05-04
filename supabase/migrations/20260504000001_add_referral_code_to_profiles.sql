-- profiles に referral_code カラムを追加
-- （ユーザーが他者を紹介するための自分専用コード。invite_code とは別物）
alter table public.profiles
  add column if not exists referral_code text unique;
