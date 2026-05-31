-- コンペ作成の一般ユーザー開放：events に作成者列を追加し、幹事（作成者）が
-- 自分の comp イベントだけを INSERT/UPDATE/DELETE できる RLS を設定する。
--
--   ※本マイグレーションの内容は本番DBに手動適用済み。リポジトリ管理用の記録。
--     再実行しても安全（idempotent）な形で記述している。
--
--   - created_by   : コンペの作成者（幹事）。auth.users を参照。ユーザー削除時は NULL に。
--   - hole_number  : 一般ユーザーのコンペ作成ではホール未指定を許容するため NOT NULL を解除。
--                    （対象ホール指定は次スライスで扱う）
--   - 3ポリシー    : 一般ユーザーは event_type='comp' かつ created_by=auth.uid() の行のみ操作可。
--                    既存の admin 用ポリシー（INSERT/DELETE）はそのまま共存する。

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.events
  ALTER COLUMN hole_number DROP NOT NULL;

-- 一般ユーザー：自分が作成する comp イベントのみ INSERT 可
DROP POLICY IF EXISTS "Users can create own comp events" ON public.events;
CREATE POLICY "Users can create own comp events"
  ON public.events FOR INSERT
  WITH CHECK (event_type = 'comp' AND created_by = auth.uid());

-- 作成者：自分の comp イベントのみ UPDATE 可
DROP POLICY IF EXISTS "Owners can update own comp events" ON public.events;
CREATE POLICY "Owners can update own comp events"
  ON public.events FOR UPDATE
  USING      (event_type = 'comp' AND created_by = auth.uid())
  WITH CHECK (event_type = 'comp' AND created_by = auth.uid());

-- 作成者：自分の comp イベントのみ DELETE 可
DROP POLICY IF EXISTS "Owners can delete own comp events" ON public.events;
CREATE POLICY "Owners can delete own comp events"
  ON public.events FOR DELETE
  USING (event_type = 'comp' AND created_by = auth.uid());
