-- 飛ばしっこGO エントリー候補から非表示にしたショットの記録
--   ユーザーがエントリーしたくないドライバーショットを除外するためのテーブル。
--   shots テーブル自体は触らず（スタッツ画面の記録を壊さない）、shot_id 単位で
--   非表示フラグを別テーブルに記録する。
--   1ショット1レコード（shot_id UNIQUE）。
--   本番DBには手動で既に作成済み。リポジトリ管理用にあとから追加。

CREATE TABLE IF NOT EXISTS public.tobashikko_hidden_shots (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid         NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  shot_id     uuid         NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (shot_id)
);

ALTER TABLE public.tobashikko_hidden_shots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tobashikko_hidden_shots_select_own" ON public.tobashikko_hidden_shots;
CREATE POLICY "tobashikko_hidden_shots_select_own"
  ON public.tobashikko_hidden_shots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tobashikko_hidden_shots_insert_own" ON public.tobashikko_hidden_shots;
CREATE POLICY "tobashikko_hidden_shots_insert_own"
  ON public.tobashikko_hidden_shots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tobashikko_hidden_shots_delete_own" ON public.tobashikko_hidden_shots;
CREATE POLICY "tobashikko_hidden_shots_delete_own"
  ON public.tobashikko_hidden_shots FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tobashikko_hidden_shots_user ON public.tobashikko_hidden_shots (user_id);
