-- 20260526120000_add_region_prefecture_to_golf_courses.sql
--
-- 目的：golf_courses に地域(region)・県(prefecture)カラムを追加し、
--       登録済み10コースに地域・県の区分けデータを設定する。
--       コース選択画面を「地域→県→ゴルフ場」の3段階で
--       絞り込めるようにするための土台。
--
-- 冪等性：ADD COLUMN IF NOT EXISTS と id 指定の UPDATE で構成。
--         再適用されても本番の状態は変化しない。

-- 1. カラム追加
ALTER TABLE golf_courses ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE golf_courses ADD COLUMN IF NOT EXISTS prefecture text;

-- 2. 登録済み10コースに地域・県を設定
UPDATE golf_courses SET region = '九州沖縄', prefecture = '鹿児島県'
  WHERE id = '8b49f87b-cdd0-4725-962e-c3ebdc8768e6'; -- 大隅カントリークラブ大崎コース
UPDATE golf_courses SET region = '九州沖縄', prefecture = '鹿児島県'
  WHERE id = 'a0511000-0000-4000-8000-000000005118'; -- 霧島ゴルフクラブ
UPDATE golf_courses SET region = '九州沖縄', prefecture = '鹿児島県'
  WHERE id = 'a0511000-0000-4000-8000-000000005112'; -- 鹿児島鹿屋カントリークラブ
UPDATE golf_courses SET region = '九州沖縄', prefecture = '鹿児島県'
  WHERE id = 'a0511000-0000-4000-8000-000000005114'; -- 湯の浦カントリー倶楽部
UPDATE golf_courses SET region = '九州沖縄', prefecture = '宮崎県'
  WHERE id = 'a0511000-0000-4000-8000-000000005116'; -- 宮崎サンシャインカントリークラブ
UPDATE golf_courses SET region = '九州沖縄', prefecture = '宮崎県'
  WHERE id = 'a0511000-0000-4000-8000-000000005117'; -- 愛和宮崎ゴルフクラブ
UPDATE golf_courses SET region = '九州沖縄', prefecture = '宮崎県'
  WHERE id = 'a0511000-0000-4000-8000-000000005113'; -- 青島ゴルフ倶楽部
UPDATE golf_courses SET region = '九州沖縄', prefecture = '宮崎県'
  WHERE id = 'a0511000-0000-4000-8000-000000005115'; -- 高千穂カントリー倶楽部
UPDATE golf_courses SET region = '九州沖縄', prefecture = '熊本県'
  WHERE id = 'bb910088-c489-4b33-b93f-42ca31f6c05c'; -- チェリーゴルフ人吉コース
UPDATE golf_courses SET region = '近畿', prefecture = '兵庫県'
  WHERE id = 'a0511000-0000-4000-8000-000000005119'; -- よみうりカントリークラブ
