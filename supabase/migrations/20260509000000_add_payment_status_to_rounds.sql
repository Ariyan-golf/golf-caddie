-- Post-pay round flow (QR-based course access)
-- 1) Add payment_status to rounds
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid'));

-- 2) Existing rows are treated as already paid (historical data)
UPDATE public.rounds
   SET payment_status = 'paid'
 WHERE payment_status = 'pending';

-- 3) Index used by the daily cleanup cron
CREATE INDEX IF NOT EXISTS idx_rounds_pending_created_at
  ON public.rounds (created_at)
  WHERE payment_status = 'pending';
