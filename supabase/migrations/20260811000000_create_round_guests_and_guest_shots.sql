-- 20260811000000_create_round_guests_and_guest_shots.sql
--
-- 目的：同伴者の飛距離を「代理測定」するための専用テーブルを新設する。
--
-- 【設計方針：shots には一切触れない】
--   既存の shots は user_id 列を持たず、所有者が shots.round_id -> rounds.user_id の
--   1経路だけで決まる。そのため同伴者のショットを shots に入れると、必ず測定者本人の
--   記録として解釈され、クラブ別平均（lib/club-averages.ts）・ホームのドライバー平均
--   （app/page.tsx）・スタッツ画面・飛ばしっこGOのエントリー候補・コンペ集計の
--   すべてに混入する。よって代理測定データは shots ではなく本ファイルの
--   guest_shots に完全分離して保存する。
--     - shots テーブルの定義・制約・RLS は変更しない
--     - tobashikko_entries / event_participants など既存テーブルの
--       user_id NOT NULL 制約や RLS も変更しない
--   結果として、既存の統計・ランキング側のクエリは一切修正不要で、
--   同伴者データが混入しないことが構造的に保証される。
--
-- 【所有権と RLS】
--   同伴者はアカウント（auth.users）を持たないため、行の所有者は
--   「そのラウンドを記録している本人」とする。判定方法は
--   001_initial_schema.sql の shots ポリシーと同じ考え方で、
--   round_id -> rounds.user_id = auth.uid() を exists 句で確認する。
--   guest_shots は round_id を直接持つので guest_id は辿らない。
--   （shots が for all 1本なのに対し、こちらは将来の権限調整に備えて
--     SELECT / INSERT / UPDATE / DELETE を個別ポリシーに分けている）
--
-- 【論理削除】
--   20260629000000_add_soft_delete_and_distance_source.sql と同じ運用に揃え、
--   物理 DELETE ではなく deleted_at を立てる（NULL = 生存）。
--   表示・集計クエリは deleted_at IS NULL で絞る。

BEGIN;

-- uuid_generate_v4() 用（001_initial_schema.sql で作成済み。念のため冪等に再宣言）
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ① round_guests：ラウンドに紐づく同伴者（アカウント不要）─────────────
CREATE TABLE IF NOT EXISTS public.round_guests (
  id             uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  round_id       uuid          NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  name           text          NOT NULL,
  display_order  integer       NOT NULL DEFAULT 0,
  created_at     timestamptz   DEFAULT now(),
  deleted_at     timestamptz
);

ALTER TABLE public.round_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "round_guests_select_own_round" ON public.round_guests;
CREATE POLICY "round_guests_select_own_round"
  ON public.round_guests FOR SELECT
  USING (
    exists (
      select 1 from public.rounds
      where rounds.id = round_guests.round_id
        and rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "round_guests_insert_own_round" ON public.round_guests;
CREATE POLICY "round_guests_insert_own_round"
  ON public.round_guests FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.rounds
      where rounds.id = round_guests.round_id
        and rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "round_guests_update_own_round" ON public.round_guests;
CREATE POLICY "round_guests_update_own_round"
  ON public.round_guests FOR UPDATE
  USING (
    exists (
      select 1 from public.rounds
      where rounds.id = round_guests.round_id
        and rounds.user_id = auth.uid()
    )
  )
  WITH CHECK (
    exists (
      select 1 from public.rounds
      where rounds.id = round_guests.round_id
        and rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "round_guests_delete_own_round" ON public.round_guests;
CREATE POLICY "round_guests_delete_own_round"
  ON public.round_guests FOR DELETE
  USING (
    exists (
      select 1 from public.rounds
      where rounds.id = round_guests.round_id
        and rounds.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_round_guests_round_id
  ON public.round_guests (round_id);

-- ─── ② guest_shots：同伴者の代理測定ショット ─────────────────────────────
--   列構成は shots の計測系（start/end 座標・距離・club）に揃えてあるが、
--   別テーブルなので shots 側の集計クエリからは一切見えない。
--   hole_id は NULL 許容（ホール未確定でも測れるようにする）。ホール行が
--   消えても計測値は残したいので ON DELETE SET NULL。
CREATE TABLE IF NOT EXISTS public.guest_shots (
  id               uuid           PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_id         uuid           NOT NULL REFERENCES public.round_guests(id) ON DELETE CASCADE,
  round_id         uuid           NOT NULL REFERENCES public.rounds(id)       ON DELETE CASCADE,
  hole_id          uuid           REFERENCES public.holes(id)                 ON DELETE SET NULL,
  start_lat        numeric(10, 7),
  start_lng        numeric(10, 7),
  end_lat          numeric(10, 7),
  end_lng          numeric(10, 7),
  distance_meters  numeric(6, 1),
  distance_yards   integer,
  club             text,
  created_at       timestamptz    DEFAULT now(),
  deleted_at       timestamptz
);

ALTER TABLE public.guest_shots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guest_shots_select_own_round" ON public.guest_shots;
CREATE POLICY "guest_shots_select_own_round"
  ON public.guest_shots FOR SELECT
  USING (
    exists (
      select 1 from public.rounds
      where rounds.id = guest_shots.round_id
        and rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "guest_shots_insert_own_round" ON public.guest_shots;
CREATE POLICY "guest_shots_insert_own_round"
  ON public.guest_shots FOR INSERT
  WITH CHECK (
    exists (
      select 1 from public.rounds
      where rounds.id = guest_shots.round_id
        and rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "guest_shots_update_own_round" ON public.guest_shots;
CREATE POLICY "guest_shots_update_own_round"
  ON public.guest_shots FOR UPDATE
  USING (
    exists (
      select 1 from public.rounds
      where rounds.id = guest_shots.round_id
        and rounds.user_id = auth.uid()
    )
  )
  WITH CHECK (
    exists (
      select 1 from public.rounds
      where rounds.id = guest_shots.round_id
        and rounds.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "guest_shots_delete_own_round" ON public.guest_shots;
CREATE POLICY "guest_shots_delete_own_round"
  ON public.guest_shots FOR DELETE
  USING (
    exists (
      select 1 from public.rounds
      where rounds.id = guest_shots.round_id
        and rounds.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_guest_shots_round_id
  ON public.guest_shots (round_id);

CREATE INDEX IF NOT EXISTS idx_guest_shots_guest_id
  ON public.guest_shots (guest_id);

COMMIT;

-- ─── ③ 適用結果の確認 ────────────────────────────────────────────────────
-- 列定義
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('round_guests', 'guest_shots')
 ORDER BY table_name, ordinal_position;

-- RLS 有効化（両テーブルとも rowsecurity = true になること）
SELECT tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public'
   AND tablename IN ('round_guests', 'guest_shots')
 ORDER BY tablename;

-- ポリシー（1テーブルにつき SELECT/INSERT/UPDATE/DELETE の4本＝計8本）
SELECT tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('round_guests', 'guest_shots')
 ORDER BY tablename, cmd, policyname;

-- インデックス（idx_round_guests_round_id / idx_guest_shots_round_id / idx_guest_shots_guest_id）
SELECT tablename, indexname
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename IN ('round_guests', 'guest_shots')
 ORDER BY tablename, indexname;
