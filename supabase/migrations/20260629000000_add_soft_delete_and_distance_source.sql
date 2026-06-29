-- 20260629000000_add_soft_delete_and_distance_source.sql
--
-- 目的：本番DBにSQL Editorで直接適用済みの「ショット論理削除」「飛距離ソース区別」
--       カラム追加を、マイグレーションファイルとして記録する（本番との乖離防止）。
--
-- 【重要】このファイルの内容はすべて本番DBに適用済みである。
--         IF NOT EXISTS で冪等に記述しているため、再実行されても状態は変化しない。
--
-- 対象：
--   1. shots          .deleted_at      timestamptz NULL許容（NULL = 生存）
--   2. shots          .distance_source text default 'gps'（'gps' = GPS計測 / 'manual' = 手入力）
--   3. shot_distances .deleted_at      timestamptz NULL許容
--   4. shot_distances .distance_source text default 'gps'
--
-- 運用：ショット削除は物理 DELETE をやめ deleted_at を立てる論理削除に変更。
--       表示・集計クエリは deleted_at IS NULL で「生きているショットのみ」を対象とする。

-- 1. shots
ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS distance_source text NOT NULL DEFAULT 'gps';

-- 2. shot_distances
ALTER TABLE public.shot_distances
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.shot_distances
  ADD COLUMN IF NOT EXISTS distance_source text NOT NULL DEFAULT 'gps';
