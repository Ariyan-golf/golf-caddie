-- コンペのドラコン対象ホール（1コンペ最大4ホール／ドラコン・逆ドラコン）。最大4件はアプリ側で制御。
CREATE TABLE IF NOT EXISTS public.event_dracon_holes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  hole_number  integer     NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  mode         text        NOT NULL DEFAULT 'dracon' CHECK (mode IN ('dracon', 'reverse')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, hole_number)
);

ALTER TABLE public.event_dracon_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator and participants can read dracon holes"
  ON public.event_dracon_holes FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.events e
            WHERE e.id = event_dracon_holes.event_id AND e.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.event_participants ep
               WHERE ep.event_id = event_dracon_holes.event_id AND ep.user_id = auth.uid())
  );

CREATE POLICY "Creator can insert dracon holes"
  ON public.event_dracon_holes FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e
            WHERE e.id = event_dracon_holes.event_id AND e.created_by = auth.uid())
  );

CREATE POLICY "Creator can update dracon holes"
  ON public.event_dracon_holes FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.events e
            WHERE e.id = event_dracon_holes.event_id AND e.created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e
            WHERE e.id = event_dracon_holes.event_id AND e.created_by = auth.uid())
  );

CREATE POLICY "Creator can delete dracon holes"
  ON public.event_dracon_holes FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.events e
            WHERE e.id = event_dracon_holes.event_id AND e.created_by = auth.uid())
  );
