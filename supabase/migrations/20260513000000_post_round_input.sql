-- Day 3 Step 1: Post-round input mode columns + ball_direction semantic split.
--
-- Background: existing shots.ball_direction stored "shape" values
-- ('hook','draw','straight','fade','slice'). The new product spec separates:
--   ball_shape     — フック / ドロー / ストレート / フェード / スライス / トップ / チョロ
--   ball_direction — 右 / 真っ直ぐ / 左
-- Prod has 24 shots rows but 0 with ball_direction set, so a rename + CHECK swap
-- is safe.

BEGIN;

-- ── shots: rename ball_direction → ball_shape, replace CHECK constraint ─────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shots' AND column_name = 'ball_direction'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shots' AND column_name = 'ball_shape'
  ) THEN
    ALTER TABLE public.shots RENAME COLUMN ball_direction TO ball_shape;
  END IF;
END $$;

-- Drop the legacy CHECK constraint on the renamed column (if it survived the rename
-- under any historical name). The auto-generated name is usually shots_ball_direction_check.
ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_ball_direction_check;
ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_ball_shape_check;

ALTER TABLE public.shots
  ADD CONSTRAINT shots_ball_shape_check
  CHECK (ball_shape IS NULL OR ball_shape IN (
    'フック', 'ドロー', 'ストレート', 'フェード', 'スライス', 'トップ', 'チョロ'
  ));

-- ── shots: new ball_direction column (左 / 真っ直ぐ / 右) ────────────────────

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS ball_direction TEXT;

ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_ball_direction_lr_check;
ALTER TABLE public.shots
  ADD CONSTRAINT shots_ball_direction_lr_check
  CHECK (ball_direction IS NULL OR ball_direction IN ('右', '真っ直ぐ', '左'));

-- ── shots: lie verticals + horizontals + free-form note + input-timing flag ─

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS lie_vertical TEXT,
  ADD COLUMN IF NOT EXISTS lie_horizontal TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS club_input_at TEXT;

ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_lie_vertical_check;
ALTER TABLE public.shots
  ADD CONSTRAINT shots_lie_vertical_check
  CHECK (lie_vertical IS NULL OR lie_vertical IN ('フラット', '左足上がり', '左足下り'));

ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_lie_horizontal_check;
ALTER TABLE public.shots
  ADD CONSTRAINT shots_lie_horizontal_check
  CHECK (lie_horizontal IS NULL OR lie_horizontal IN ('フラット', '爪先上がり', '爪先下がり'));

ALTER TABLE public.shots DROP CONSTRAINT IF EXISTS shots_club_input_at_check;
ALTER TABLE public.shots
  ADD CONSTRAINT shots_club_input_at_check
  CHECK (club_input_at IS NULL OR club_input_at IN ('当日', '事後'));

-- ── profiles: input_mode preference (default = post_round) ──────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS input_mode TEXT NOT NULL DEFAULT 'post_round';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_input_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_input_mode_check
  CHECK (input_mode IN ('post_round', 'realtime'));

COMMIT;
