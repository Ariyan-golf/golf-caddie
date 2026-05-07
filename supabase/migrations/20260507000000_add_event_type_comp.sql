-- イベントタイプ列と参加コード列を追加
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'monthly'
    CHECK (event_type IN ('monthly', 'comp')),
  ADD COLUMN IF NOT EXISTS event_code text;

-- event_code は NULL でない場合のみ一意
CREATE UNIQUE INDEX IF NOT EXISTS events_event_code_unique
  ON public.events (event_code)
  WHERE event_code IS NOT NULL;

-- コンペ参加者テーブル
CREATE TABLE IF NOT EXISTS public.event_participants (
  id        uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  uuid         NOT NULL REFERENCES public.events(id)  ON DELETE CASCADE,
  user_id   uuid         NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  joined_at timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

-- 自分の参加情報のみ閲覧
CREATE POLICY "participants_select_own"
  ON public.event_participants FOR SELECT
  USING (auth.uid() = user_id);

-- 自分の参加登録のみ可能
CREATE POLICY "participants_insert_own"
  ON public.event_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);
