-- =====================================================================
-- course_tees テーブル + rounds 関連カラム（再適用）
--
-- 既存マイグレーション 20260505000003_add_course_tees_and_round_fields.sql が
-- 本番DBに未適用だったため、同等内容を冪等で再定義する。
--
-- 対象:
--   - course_tees: green × tee の組み合わせ + コースレート/スロープ
--     → app/api/admin/golf-courses/route.ts (POST) で INSERT される
--   - rounds.golf_course_id / course_tee_id / course_rating / slope_rating
--     / handicap_differential → /round/start, /round/new, HoleRecorder で使用
-- =====================================================================

-- ─── ① course_tees テーブル ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_tees (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id     UUID NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
  green_type    TEXT NOT NULL,
  tee_name      TEXT NOT NULL,
  course_rating NUMERIC(4,1),
  slope_rating  INTEGER,
  distance      INTEGER,
  UNIQUE (course_id, green_type, tee_name)
);

ALTER TABLE public.course_tees ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは読み取り可（INSERT/UPDATE/DELETE は service_role 経由でのみ）
DROP POLICY IF EXISTS "Authenticated users can read course_tees" ON public.course_tees;
CREATE POLICY "Authenticated users can read course_tees"
  ON public.course_tees FOR SELECT
  TO authenticated
  USING (true);

-- ─── ② rounds テーブル拡張（同migrationにあった分） ─────────────────
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS golf_course_id        UUID REFERENCES public.golf_courses(id),
  ADD COLUMN IF NOT EXISTS course_tee_id         UUID REFERENCES public.course_tees(id),
  ADD COLUMN IF NOT EXISTS course_rating         NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS slope_rating          INTEGER,
  ADD COLUMN IF NOT EXISTS handicap_differential NUMERIC(5,1);

-- ─── ③ 適用後の確認用クエリ（参考） ───────────────────────────────────
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'rounds'
--    AND column_name IN ('golf_course_id','course_tee_id','course_rating',
--                        'slope_rating','handicap_differential');
--
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'course_tees';
