-- 飛ばしっこGO 参加設定用カラム追加
--   nickname  : ランキング公開用の表示名（display_name とは別管理。本名利用回避目的）
--   age_group : 年代区分（'20s'/'30s'/'40s'/'50s'/'60plus'）

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname  text,
  ADD COLUMN IF NOT EXISTS age_group text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_age_group_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_group_check
  CHECK (age_group IS NULL OR age_group IN ('20s', '30s', '40s', '50s', '60plus'));
