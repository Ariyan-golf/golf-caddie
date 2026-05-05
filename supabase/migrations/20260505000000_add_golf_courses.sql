-- Golf courses master table
CREATE TABLE IF NOT EXISTS public.golf_courses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  local_rules TEXT,
  tee1_name TEXT DEFAULT 'ティー1',
  tee2_name TEXT DEFAULT 'ティー2',
  tee3_name TEXT DEFAULT 'ティー3',
  tee4_name TEXT DEFAULT 'ティー4',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-hole data for each course
CREATE TABLE IF NOT EXISTS public.course_holes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL DEFAULT 4 CHECK (par BETWEEN 3 AND 5),
  hdcp INTEGER CHECK (hdcp BETWEEN 1 AND 18),
  distance_tee1 INTEGER,
  distance_tee2 INTEGER,
  distance_tee3 INTEGER,
  distance_tee4 INTEGER,
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
