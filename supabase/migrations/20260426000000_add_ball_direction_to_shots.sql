ALTER TABLE shots ADD COLUMN IF NOT EXISTS ball_direction TEXT
  CHECK (ball_direction IN ('hook', 'draw', 'straight', 'fade', 'slice'));
