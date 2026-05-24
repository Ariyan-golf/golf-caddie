-- events.event_type の CHECK 制約を 3 値（monthly/comp/tobashikko）に拡張
--   "tobashikko" = 飛ばしっこGO（全国・ゴルフ場非依存）の新規イベントタイプ。
--   既存制約は 'monthly' / 'comp' しか許容していなかったため、tobashikko の
--   insert がそのままだと弾かれる。
--   本マイグレーションは idempotent（DROP IF EXISTS → ADD）。

BEGIN;

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_event_type_check
  CHECK (event_type IN ('monthly', 'comp', 'tobashikko'));

COMMIT;

-- Rollback:
-- BEGIN;
-- ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_event_type_check;
-- ALTER TABLE public.events
--   ADD CONSTRAINT events_event_type_check
--   CHECK (event_type IN ('monthly', 'comp'));
-- COMMIT;
