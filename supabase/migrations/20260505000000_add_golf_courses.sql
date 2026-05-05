-- Golf courses master table
CREATE TABLE IF NOT EXISTS public.golf_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  local_rules TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-hole data for each course
CREATE TABLE IF NOT EXISTS public.course_holes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL DEFAULT 4 CHECK (par BETWEEN 3 AND 5),
  hdcp INTEGER CHECK (hdcp BETWEEN 1 AND 18),
  distance_blue INTEGER,
  distance_orange INTEGER,
  distance_white INTEGER,
  distance_red INTEGER,
  UNIQUE (course_id, hole_number)
);

ALTER TABLE public.golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read course data
CREATE POLICY "Authenticated users can read golf_courses"
  ON public.golf_courses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read course_holes"
  ON public.course_holes FOR SELECT
  TO authenticated
  USING (true);
