-- course_tees: green × tee combination with ratings
CREATE TABLE IF NOT EXISTS public.course_tees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  green_type TEXT NOT NULL,
  tee_name TEXT NOT NULL,
  course_rating NUMERIC(4,1),
  slope_rating INTEGER,
  distance INTEGER,
  UNIQUE (course_id, green_type, tee_name)
);

ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read course_tees"
  ON public.course_tees FOR SELECT
  TO authenticated
  USING (true);

-- Add tee / handicap columns to rounds
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS golf_course_id UUID REFERENCES public.golf_courses(id),
  ADD COLUMN IF NOT EXISTS course_tee_id  UUID REFERENCES public.course_tees(id),
  ADD COLUMN IF NOT EXISTS course_rating  NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS slope_rating   INTEGER,
  ADD COLUMN IF NOT EXISTS handicap_differential NUMERIC(5,1);
