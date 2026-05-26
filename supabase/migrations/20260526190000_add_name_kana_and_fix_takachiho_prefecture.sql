-- 20260526190000_add_name_kana_and_fix_takachiho_prefecture.sql
--
-- 目的：
--   1. golf_courses に name_kana（ふりがな）カラムを追加し、
--      登録済み10コースにふりがなを設定する（県別ゴルフ場一覧の五十音順表示用）。
--   2. 高千穂カントリー倶楽部の prefecture を宮崎県→鹿児島県に修正する。
--      （所在地は鹿児島県霧島市。先のマイグレーションで宮崎県と誤設定していた）
--
-- 冪等性：ADD COLUMN IF NOT EXISTS と id 指定の UPDATE で構成。
--         再適用されても本番の状態は変化しない。

-- 1. ふりがなカラム追加
ALTER TABLE golf_courses ADD COLUMN IF NOT EXISTS name_kana text;

-- 2. 登録済み10コースにふりがなを設定
UPDATE golf_courses SET name_kana = 'あいわみやざきごるふくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005117'; -- 愛和宮崎ゴルフクラブ
UPDATE golf_courses SET name_kana = 'あおしまごるふくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005113'; -- 青島ゴルフ倶楽部
UPDATE golf_courses SET name_kana = 'おおすみかんとりーくらぶおおさきこーす'
  WHERE id = '8b49f87b-cdd0-4725-962e-c3ebdc8768e6'; -- 大隅カントリークラブ大崎コース
UPDATE golf_courses SET name_kana = 'かごしまかのやかんとりーくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005112'; -- 鹿児島鹿屋カントリークラブ
UPDATE golf_courses SET name_kana = 'きりしまごるふくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005118'; -- 霧島ゴルフクラブ
UPDATE golf_courses SET name_kana = 'たかちほかんとりーくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005115'; -- 高千穂カントリー倶楽部
UPDATE golf_courses SET name_kana = 'ちぇりーごるふひとよしこーす'
  WHERE id = 'bb910088-c489-4b33-b93f-42ca31f6c05c'; -- チェリーゴルフ人吉コース
UPDATE golf_courses SET name_kana = 'みやざきさんしゃいんかんとりーくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005116'; -- 宮崎サンシャインカントリークラブ
UPDATE golf_courses SET name_kana = 'ゆのうらかんとりーくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005114'; -- 湯の浦カントリー倶楽部
UPDATE golf_courses SET name_kana = 'よみうりかんとりーくらぶ'
  WHERE id = 'a0511000-0000-4000-8000-000000005119'; -- よみうりカントリークラブ

-- 3. 高千穂カントリー倶楽部の県を鹿児島県に修正
UPDATE golf_courses SET prefecture = '鹿児島県'
  WHERE id = 'a0511000-0000-4000-8000-000000005115'; -- 高千穂カントリー倶楽部
