-- 20260616000000_add_ranking_opt_in_to_profiles.sql
--
-- 目的：
--   飛ばしっこGO 全国ランキングへの「参加する/しない」を表す列を profiles に追加する。
--   オプトアウト方式：DEFAULT true のため既存ユーザーは引き続き参加扱い。
--   OFF（false）にしたユーザーだけ、公開ランキング・自慢カードから除外される。
--   （記録・スタッツ・ランキング閲覧は OFF でも引き続き可能）
--
-- 冪等性：ADD COLUMN IF NOT EXISTS で構成。再適用しても安全。
-- ※ 実DBへの適用は Supabase 側で別途手動実行済み。本ファイルは履歴整合用。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ranking_opt_in boolean NOT NULL DEFAULT true;
