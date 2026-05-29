-- =====================================================================
-- 大隅カントリークラブ テストデータ クリーンアップSQL
-- 作成日: 2026-05-12
--
-- 用途:
--   2026-05-11 の本番テストで作成された「大隅CC」関連の
--   テストデータをSupabaseから安全に削除する。
--
-- 実行方法:
--   1. Supabase SQL Editor を開く
--   2. このファイルの全文を貼り付ける
--   3. 必要に応じて「STEP 0」のUUID（osumi_id）を書き換える
--   4. まず「STEP 1: 削除対象件数の確認」を実行して件数を目視確認
--   5. 件数に問題なければ「STEP 2: 削除トランザクション」を実行
--   6. 不安な場合は COMMIT を ROLLBACK に書き換えて試運転可能
--
-- 安全装置:
--   - BEGIN / COMMIT で囲んでいるためトランザクション中に
--     何か想定外があれば ROLLBACK で全て巻き戻せる
--   - course_idはSET LOCALで変数化（実行時に置換可能）
--   - 子テーブル → 親テーブル の順で削除（FK制約違反を回避）
--
-- 想定の削除順序（依存関係に基づく）:
--   shots → holes → round_revenue → rounds
--    → course_tees → course_holes → golf_course_agents → golf_courses
--   ※round_payments は rounds CASCADE で連動削除される
-- =====================================================================


-- =====================================================================
-- STEP 0: 対象course_idの設定（必要に応じてここだけ書き換える）
-- =====================================================================
-- 大隅CCのcourse_idは supabase/test-data/osumi_cc_20260511.sql で
-- 固定値として登録されている（QR安定のため）
BEGIN;
SET LOCAL myapp.osumi_id = 'a0511000-0000-4000-8000-000000005111';

-- 念のため、対象のゴルフ場が実在することを確認
SELECT id, name, address, created_at
  FROM public.golf_courses
 WHERE id = current_setting('myapp.osumi_id')::uuid;
-- 期待: 1行（name = '大隅カントリークラブ'）
-- もし0行ならcourse_idが間違っているのでSTEP 2を実行しないこと
COMMIT;


-- =====================================================================
-- STEP 1: 削除対象件数の確認（読み取り専用・実行しても変更なし）
-- =====================================================================
-- このブロックを実行して件数を目視確認してからSTEP 2へ進むこと
BEGIN;
SET LOCAL myapp.osumi_id = 'a0511000-0000-4000-8000-000000005111';

-- ① golf_courses（大隅CCそのもの） 期待: 1
SELECT 'golf_courses' AS table_name, COUNT(*) AS row_count
  FROM public.golf_courses
 WHERE id = current_setting('myapp.osumi_id')::uuid;

-- ② course_holes（18ホール分）期待: 18
SELECT 'course_holes' AS table_name, COUNT(*) AS row_count
  FROM public.course_holes
 WHERE course_id = current_setting('myapp.osumi_id')::uuid;

-- ③ course_tees（ティー情報）期待: 数件
SELECT 'course_tees' AS table_name, COUNT(*) AS row_count
  FROM public.course_tees
 WHERE course_id = current_setting('myapp.osumi_id')::uuid;

-- ④ rounds（大隅CCで作成されたラウンド）
SELECT 'rounds' AS table_name, COUNT(*) AS row_count
  FROM public.rounds
 WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid;

-- ⑤ holes（大隅CCのラウンド配下のホール）
SELECT 'holes' AS table_name, COUNT(*) AS row_count
  FROM public.holes
 WHERE round_id IN (
   SELECT id FROM public.rounds
    WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
 );

-- ⑥ shots（大隅CCのラウンド配下のショット）
SELECT 'shots' AS table_name, COUNT(*) AS row_count
  FROM public.shots
 WHERE round_id IN (
   SELECT id FROM public.rounds
    WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
 );

-- ⑦ round_revenue（大隅CCの収益記録）
--    golf_course_idはTEXT型なのでキャストして比較
SELECT 'round_revenue' AS table_name, COUNT(*) AS row_count
  FROM public.round_revenue
 WHERE round_id IN (
        SELECT id FROM public.rounds
         WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
       )
    OR golf_course_id = current_setting('myapp.osumi_id');

-- ⑧ golf_course_agents（大隅CCの営業者紐付け）
--    golf_course_idはTEXT型
SELECT 'golf_course_agents' AS table_name, COUNT(*) AS row_count
  FROM public.golf_course_agents
 WHERE golf_course_id = current_setting('myapp.osumi_id');

-- ─── 以下の3テーブルは course_id 列が無く、自動で「大隅CC由来」を
-- ─── 判定できない。手動で対象行を特定する必要がある。
-- ─── STEP 1の④⑤⑥で確認した round.user_id / shots.id などを元に
-- ─── 必要なら後述の任意ブロックで個別に削除する。

-- ⑨ shot_distances（参考表示）— user_idベース
--   user_idの絞り込みが必要なため、ここでは大隅CCラウンド作成者の一覧のみ提示
SELECT 'shot_distances (per user)' AS table_name,
       sd.user_id,
       COUNT(*) AS row_count
  FROM public.shot_distances sd
 WHERE sd.user_id IN (
   SELECT DISTINCT user_id FROM public.rounds
    WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
 )
 GROUP BY sd.user_id;

-- ⑩ referrals（参考表示）— 大隅CC由来のテスト紹介関係
SELECT 'referrals (related users)' AS table_name,
       r.id, r.referrer_id, r.referred_user_id, r.created_at
  FROM public.referrals r
 WHERE r.referrer_id IN (
         SELECT DISTINCT user_id FROM public.rounds
          WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
       )
    OR r.referred_user_id IN (
         SELECT DISTINCT user_id FROM public.rounds
          WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
       );

-- ⑪ invite_codes（参考表示）— テスト用に作成された招待コード
--    course_idとは紐付かないため全件表示し、目視で「誤って作った」コードを特定
SELECT 'invite_codes (manual review)' AS table_name,
       id, code, role, graduation_year, created_at
  FROM public.invite_codes
 ORDER BY created_at DESC;

COMMIT;


-- =====================================================================
-- STEP 2: 削除トランザクション（実行すると実データが削除される）
--
-- ⚠️ 危険: STEP 1の件数を確認してから実行すること
--
-- 試運転したい場合は最後の `COMMIT;` を `ROLLBACK;` に書き換えれば
-- 削除件数だけ確認して巻き戻せる。
-- =====================================================================
BEGIN;
SET LOCAL myapp.osumi_id = 'a0511000-0000-4000-8000-000000005111';

-- ─── ① 子テーブル: shots（大隅CCのラウンド配下） ───
DELETE FROM public.shots
 WHERE round_id IN (
   SELECT id FROM public.rounds
    WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
 );

-- ─── ② 子テーブル: holes ───
DELETE FROM public.holes
 WHERE round_id IN (
   SELECT id FROM public.rounds
    WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
 );

-- ─── ③ 子テーブル: round_revenue ───
DELETE FROM public.round_revenue
 WHERE round_id IN (
        SELECT id FROM public.rounds
         WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid
       )
    OR golf_course_id = current_setting('myapp.osumi_id');

-- ─── ④ 親: rounds（これにより round_payments も CASCADE で削除） ───
DELETE FROM public.rounds
 WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid;

-- ─── ⑤ コース構成: course_tees ───
DELETE FROM public.course_tees
 WHERE course_id = current_setting('myapp.osumi_id')::uuid;

-- ─── ⑥ コース構成: course_holes ───
DELETE FROM public.course_holes
 WHERE course_id = current_setting('myapp.osumi_id')::uuid;

-- ─── ⑦ 営業者紐付け: golf_course_agents ───
DELETE FROM public.golf_course_agents
 WHERE golf_course_id = current_setting('myapp.osumi_id');

-- ─── ⑧ 最後に親本体: golf_courses ───
DELETE FROM public.golf_courses
 WHERE id = current_setting('myapp.osumi_id')::uuid;

-- ─── 削除直後の最終確認（0件になっているはず） ───
SELECT 'AFTER_DELETE_golf_courses' AS check_name, COUNT(*) AS row_count
  FROM public.golf_courses
 WHERE id = current_setting('myapp.osumi_id')::uuid;
-- 期待: 0

SELECT 'AFTER_DELETE_course_holes' AS check_name, COUNT(*) AS row_count
  FROM public.course_holes
 WHERE course_id = current_setting('myapp.osumi_id')::uuid;
-- 期待: 0

SELECT 'AFTER_DELETE_rounds' AS check_name, COUNT(*) AS row_count
  FROM public.rounds
 WHERE golf_course_id = current_setting('myapp.osumi_id')::uuid;
-- 期待: 0

-- ⚠️ 試運転（rollback）したい場合は次の行を ROLLBACK; に書き換える
COMMIT;


-- =====================================================================
-- STEP 3（任意）: コース紐付け不能なテーブルの個別削除
--
-- 以下のテーブルは course_id列を持たないため、自動では削除できない。
-- STEP 1の⑨⑩⑪で表示された行を目視確認した上で、必要なIDをコピペして
-- 個別にコメントアウトを外し、慎重に削除すること。
-- =====================================================================

-- ─── shot_distances を特定ユーザーぶん削除（例） ───
-- BEGIN;
-- DELETE FROM public.shot_distances
--  WHERE user_id = '<大隅CCテスト用ユーザーのUUID>';
-- COMMIT;

-- ─── referrals を特定IDで削除（例） ───
-- BEGIN;
-- DELETE FROM public.referrals
--  WHERE id IN (
--    '<referrals.idをここに>',
--    '<referrals.idをここに>'
--  );
-- COMMIT;

-- ─── invite_codes を特定コードで削除（例） ───
-- BEGIN;
-- DELETE FROM public.invite_codes
--  WHERE code IN (
--    '<誤って作成した招待コード>',
--    '<誤って作成した招待コード>'
--  );
-- COMMIT;
