ALTER TABLE public.holes
  ADD COLUMN IF NOT EXISTS fairway_result text
    CHECK (fairway_result IS NULL OR fairway_result IN ('hit', 'left', 'right'));
