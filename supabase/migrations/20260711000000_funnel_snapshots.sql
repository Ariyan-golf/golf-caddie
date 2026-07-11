-- 週次ファネル自動集計システム（2026-07-11 SQL Editorで本番適用済み）
CREATE TABLE IF NOT EXISTS funnel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz NOT NULL DEFAULT now(),
  try_devices integer,
  registered integer,
  reached_1r integer,
  reached_3r integer,
  subscribers integer,
  day_pass_users integer,
  note text
);

ALTER TABLE funnel_snapshots ENABLE ROW LEVEL SECURITY;
-- ポリシー無し = クライアントから読み書き不可（service role / SQL Editorのみ）

CREATE OR REPLACE FUNCTION record_funnel_snapshot()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO funnel_snapshots
    (try_devices, registered, reached_1r, reached_3r, subscribers, day_pass_users)
  SELECT
    (SELECT COUNT(DISTINCT device_id) FROM anonymous_shots),
    COUNT(*),
    COUNT(*) FILTER (WHERE round_count >= 1),
    COUNT(*) FILTER (WHERE round_count >= 3),
    COUNT(*) FILTER (WHERE plan IN ('premium','premium_paid','standard')),
    COUNT(*) FILTER (WHERE day_pass_date IS NOT NULL)
  FROM profiles
  WHERE role <> 'pro';
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'weekly-funnel-snapshot',
  '0 0 * * 5',
  'SELECT record_funnel_snapshot()'
);
