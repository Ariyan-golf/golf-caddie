-- 20260702000000_anonymous_shots.sql
--
-- 目的：/try（登録不要のソロ飛距離計測）の匿名計測データを蓄積するテーブル。
--       ログイン前のユーザーが測った1打1打を端末ID（device_id）付きで貯めておき、
--       将来のデータ事業（飛距離分布・母数確保・クラブ別統計等）の素材にする。
--
-- 【設計方針：書き込み専用（write-only from client）】
--   - クライアント（anon / authenticated）は INSERT のみ可能。
--   - SELECT / UPDATE / DELETE のポリシーは意図的に作らない。RLS 有効下では
--     ポリシーの無い操作は既定で拒否されるため、匿名クライアントからは
--     自分が入れた行すら読み返せない（漏洩・スクレイピング防止）。
--   - 読み取り・集計・分析は service role（RLS バイパス）でのみ行う想定。
--   - device_id は端末側で生成する UUID（localStorage 等に保持）。個人特定情報ではなく、
--     同一端末の計測をまとめる緩い識別子。認証ユーザーとの紐付けは持たせない。

CREATE TABLE IF NOT EXISTS public.anonymous_shots (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id        uuid         NOT NULL,
  club             text,
  distance_meters  numeric,
  distance_yards   numeric,
  start_lat        double precision,
  start_lng        double precision,
  end_lat          double precision,
  end_lng          double precision,
  accuracy_start   numeric,
  accuracy_end     numeric,
  club_input_at    text,
  measured_at      timestamptz  NOT NULL,
  created_at       timestamptz  NOT NULL DEFAULT now()
);

-- 端末ごとの抽出と時系列集計を想定したインデックス。
CREATE INDEX IF NOT EXISTS idx_anonymous_shots_device_id  ON public.anonymous_shots (device_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_shots_created_at ON public.anonymous_shots (created_at);

ALTER TABLE public.anonymous_shots ENABLE ROW LEVEL SECURITY;

-- INSERT のみ許可（anon / authenticated 両方）。制約なしで受け入れる。
-- SELECT/UPDATE/DELETE のポリシーは作らない＝クライアントからは読めない・変更できない。
CREATE POLICY "Anyone can insert anonymous shots"
  ON public.anonymous_shots FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
