-- events: admin-defined contest periods tied to a course + hole
CREATE TABLE IF NOT EXISTS events (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid         REFERENCES golf_courses(id) ON DELETE CASCADE,
  hole_number  integer      NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  event_name   text         NOT NULL,
  start_date   date         NOT NULL,
  end_date     date         NOT NULL CHECK (end_date >= start_date),
  created_at   timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read events"
  ON events FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can insert events"
  ON events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND email = 't.a.0903076959@i.softbank.jp'
    )
  );

CREATE POLICY "Admins can delete events"
  ON events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND email = 't.a.0903076959@i.softbank.jp'
    )
  );

CREATE INDEX idx_events_course_id ON events (course_id);
CREATE INDEX idx_events_dates     ON events (start_date, end_date);
