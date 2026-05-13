-- Day3 Step4: green_centers
-- Stores the GPS coordinates of each green's center, registered by any
-- authenticated user while standing on the green. Used by the round-UI
-- "remaining distance" display and (later) by the AI caddie pipeline.
--
-- One row per (course, hole, green_type). UPSERT-by-conflict so the latest
-- registration wins.

CREATE TABLE IF NOT EXISTS public.green_centers (
  id            uuid              DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id     uuid              REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  hole_number   integer           NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  green_type    text              NOT NULL CHECK (green_type IN ('main', 'sub')),
  latitude      double precision  NOT NULL,
  longitude     double precision  NOT NULL,
  registered_by uuid              REFERENCES auth.users(id),
  registered_at timestamptz       NOT NULL DEFAULT now(),
  UNIQUE (course_id, hole_number, green_type)
);

ALTER TABLE public.green_centers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read green_centers"
  ON public.green_centers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to upsert green_centers"
  ON public.green_centers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
