-- shot_distances: GPS-measured shot distance records with club selection
CREATE TABLE IF NOT EXISTS shot_distances (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club             text          NOT NULL,
  distance_yards   integer       NOT NULL,
  distance_meters  numeric(6,1)  NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE shot_distances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own shot distances"
  ON shot_distances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own shot distances"
  ON shot_distances FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_shot_distances_user_id ON shot_distances (user_id, created_at DESC);
