-- =====================================================================
-- golf_courses / course_holes の RLS ポリシー再適用（冪等）
--
-- 経緯: 20260505000000_add_golf_courses.sql で定義した SELECT ポリシーが
-- 本番DBに反映されておらず、authenticated ユーザーから
-- golf_courses / course_holes が一切読めない状態だった
-- （course_tees は 20260509000001 で再作成済みのため正常）。
--
-- 症状: /round/start?course_id=... にログイン後アクセスしても
-- golf_courses から空が返り「ゴルフ場が見つかりませんでした」になる。
--
-- 対応: course_tees のときと同じく DROP POLICY IF EXISTS → CREATE POLICY
-- で冪等に再適用する。
-- =====================================================================

ALTER TABLE public.golf_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_holes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read golf_courses" ON public.golf_courses;
CREATE POLICY "Authenticated users can read golf_courses"
  ON public.golf_courses FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read course_holes" ON public.course_holes;
CREATE POLICY "Authenticated users can read course_holes"
  ON public.course_holes FOR SELECT
  TO authenticated
  USING (true);

-- ─── 適用後の確認用クエリ（参考） ────────────────────────────────────
-- SELECT schemaname, tablename, policyname, roles, cmd, qual
--   FROM pg_policies
--  WHERE schemaname = 'public'
--    AND tablename IN ('golf_courses', 'course_holes', 'course_tees');
