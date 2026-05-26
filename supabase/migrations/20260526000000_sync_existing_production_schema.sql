-- 20260526000000_sync_existing_production_schema.sql
--
-- 目的：本番DBにSQL Editorで直接適用済みだが、マイグレーション
--       ファイルに記録が無かった構造変更を、記録として書き起こす。
--
-- 【重要】このファイルの内容はすべて本番DBに適用済みである。
--         全文を冪等（IF NOT EXISTS / DROP IF EXISTS→ADD）に記述
--         しているため、再実行されても本番の状態は変化しない。
--
-- 対象：
--   1. course_tees.display_order カラム
--   2. holes_par_check   制約（par 3〜7）
--   3. holes_putts_check 制約（putts IS NULL OR 0〜99）
--   4. holes_score_check 制約（score IS NULL OR 1〜99）

-- 1. course_tees.display_order
ALTER TABLE course_tees
  ADD COLUMN IF NOT EXISTS display_order integer;

-- 2. holes.par の CHECK制約を 3〜7 に
ALTER TABLE holes DROP CONSTRAINT IF EXISTS holes_par_check;
ALTER TABLE holes ADD CONSTRAINT holes_par_check
  CHECK (par >= 3 AND par <= 7);

-- 3. holes.putts の CHECK制約を putts IS NULL OR 0〜99 に
ALTER TABLE holes DROP CONSTRAINT IF EXISTS holes_putts_check;
ALTER TABLE holes ADD CONSTRAINT holes_putts_check
  CHECK (putts IS NULL OR (putts >= 0 AND putts <= 99));

-- 4. holes.score の CHECK制約を score IS NULL OR 1〜99 に
ALTER TABLE holes DROP CONSTRAINT IF EXISTS holes_score_check;
ALTER TABLE holes ADD CONSTRAINT holes_score_check
  CHECK (score IS NULL OR (score >= 1 AND score <= 99));
