-- tobashikko_entries: 機種名・シャフト関連カラム追加
--   driver_model : ドライバー機種名（例: "Qi10LS 9.5度"）
--   shaft_brand  : シャフトメーカー
--   shaft_model  : シャフト機種名（例: "ベンタスTR"）
--   ball_model   : ボール機種名（例: "TOUR B X"）
--
--   すべて NULL 許容（シャフト系は特に未入力が普通の前提）。

ALTER TABLE public.tobashikko_entries
  ADD COLUMN IF NOT EXISTS driver_model text,
  ADD COLUMN IF NOT EXISTS shaft_brand  text,
  ADD COLUMN IF NOT EXISTS shaft_model  text,
  ADD COLUMN IF NOT EXISTS ball_model   text;
