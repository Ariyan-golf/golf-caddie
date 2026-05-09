-- =====================================================================
-- 大隅CC 動作確認用SQL（2026-05-11 本番テスト）
-- Supabase SQL Editor で順番に実行してください
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- ① DB変更の確認（マイグレーション 20260509000000 の適用結果）
-- ─────────────────────────────────────────────────────────────────────

-- payment_status カラムが追加されているか
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'rounds'
   AND column_name IN ('payment_status', 'golf_course_id');
-- 期待: payment_status text 'pending' NO / golf_course_id uuid YES

-- CHECK 制約
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid = 'public.rounds'::regclass
   AND conname LIKE '%payment_status%';
-- 期待: payment_status IN ('pending','paid')

-- 既存レコードが全て 'paid' になっているか
SELECT payment_status, COUNT(*)
  FROM public.rounds
 GROUP BY payment_status;
-- 期待: paid=既存件数 / pending=0

-- cleanup-cron 用インデックス
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename  = 'rounds'
   AND indexname  = 'idx_rounds_pending_created_at';

-- ─────────────────────────────────────────────────────────────────────
-- ② 大隅カントリークラブ をテストデータとして追加
--    course_id を固定値にしてQRコードURLを安定させる
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  osumi_id UUID := 'a0511000-0000-4000-8000-000000005111';
BEGIN
  -- ゴルフ場本体（18H デフォルト）
  INSERT INTO public.golf_courses (id, name, address, course_type)
  VALUES (osumi_id, '大隅カントリークラブ', '鹿児島県鹿屋市', '18H')
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        address = EXCLUDED.address;

  -- 18H分のホールデータ（par 4 デフォルト・距離未設定）
  INSERT INTO public.course_holes (course_id, hole_number, par, course_section)
  SELECT osumi_id, gs, 4, ''
    FROM generate_series(1, 18) gs
    ON CONFLICT (course_id, course_section, hole_number) DO NOTHING;

  -- ティー情報（最低限）
  INSERT INTO public.course_tees (course_id, green_type, tee_name)
  VALUES
    (osumi_id, 'ベント', 'レギュラー'),
    (osumi_id, 'ベント', 'バック')
    ON CONFLICT DO NOTHING;
END $$;

-- 追加結果の確認
SELECT id, name, address, course_type
  FROM public.golf_courses
 WHERE id = 'a0511000-0000-4000-8000-000000005111';

SELECT COUNT(*) AS hole_count
  FROM public.course_holes
 WHERE course_id = 'a0511000-0000-4000-8000-000000005111';
-- 期待: 18

-- ─────────────────────────────────────────────────────────────────────
-- ③ QRコード生成用URL
--    下記URLをQRコード生成サービスで画像化してプリント・掲示
-- ─────────────────────────────────────────────────────────────────────
--
--   https://golf-caddie-eight.vercel.app/round/start?course_id=a0511000-0000-4000-8000-000000005111
--

-- ─────────────────────────────────────────────────────────────────────
-- ④ テスト後のクリーンアップ用（必要に応じて手動実行）
-- ─────────────────────────────────────────────────────────────────────
-- 大隅CCで作成された pending ラウンドを即時削除（cron動作確認の代わり）
-- DELETE FROM public.rounds
--  WHERE golf_course_id = 'a0511000-0000-4000-8000-000000005111'
--    AND payment_status = 'pending';

-- 大隅CCを削除してテスト前の状態に戻す（CASCADEで course_holes/course_tees も削除）
-- DELETE FROM public.golf_courses
--  WHERE id = 'a0511000-0000-4000-8000-000000005111';
