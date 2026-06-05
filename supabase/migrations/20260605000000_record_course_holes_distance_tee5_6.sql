-- 20260605000000_record_course_holes_distance_tee5_6.sql
--
-- 目的：本番DBにSQL Editorで直接適用済みだが、マイグレーション台帳に記録が
--       無かった course_holes の distance_tee5 / distance_tee6 を書き起こす。
--
-- 【重要】この2カラムはすでに本番DBに存在する（5〜6ティのコースで使用中）。
--         IF NOT EXISTS で冪等記述のため、再実行されても本番は変化しない。
--         本プロジェクトはSupabase CLI未使用のため、本ファイルは「設計図の記録」
--         であり、本番への適用は手動SQL Editorで完了済み。
--
-- 背景：ホールごと・ティごとの距離は course_holes.distance_tee1〜6 に格納する設計。
--       tee1〜4は初期定義に含まれていたが、tee5/tee6 は後からSQL Editorで追加され
--       記録が漏れていた（よみうり・中津・湯布高原など5〜6ティのコースで使用）。

ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS distance_tee5 integer,
  ADD COLUMN IF NOT EXISTS distance_tee6 integer;
