-- 飛ばしっこGO エントリー記録
--   ユーザーが自分のドライバーショット（shots.club='1w'）から
--   エントリーしたい記録を選んで、使用クラブ・ボールを付加するテーブル。
--   1ショット1エントリー（shot_id UNIQUE）。
--   shot_id にひもづく shots 行 / user に紐づくユーザーが消えたら一緒に消す。

CREATE TABLE IF NOT EXISTS public.tobashikko_entries (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  shot_id       uuid         NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
  driver_brand  text,
  ball_brand    text,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (shot_id)
);

ALTER TABLE public.tobashikko_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tobashikko_entries_select_own"
  ON public.tobashikko_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "tobashikko_entries_insert_own"
  ON public.tobashikko_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tobashikko_entries_update_own"
  ON public.tobashikko_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "tobashikko_entries_delete_own"
  ON public.tobashikko_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tobashikko_entries_user ON public.tobashikko_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_tobashikko_entries_shot ON public.tobashikko_entries (shot_id);

-- updated_at 自動更新（set_updated_at() は 002_beta_user_management.sql で定義済）
DROP TRIGGER IF EXISTS tobashikko_entries_updated_at ON public.tobashikko_entries;
CREATE TRIGGER tobashikko_entries_updated_at
  BEFORE UPDATE ON public.tobashikko_entries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
