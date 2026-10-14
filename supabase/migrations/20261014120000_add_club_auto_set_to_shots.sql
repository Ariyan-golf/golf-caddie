-- shots.club_auto_set: パー4・パー5の第1打を計測時に自動で1W（ドライバー）にしたかどうか。
--
-- Background:
--   ティーショット計測時に番手が未選択だと club が NULL のまま保存され、
--   ドライバー平均・最長などの集計に入らなかった。計測時にパー4・パー5の
--   第1打を自動で club='1w' として保存するにあたり、自動設定か手動選択かを区別する。
--
-- Values:
--   true  = 計測時に自動で1Wを設定した（未変更）
--   false = 手動で選択した、または番手未設定（既存行はすべて false）
--   ラウンド中・スタッツ画面のどちらで番手を変更しても false に戻す。

ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS club_auto_set boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shots.club_auto_set IS
  'true=パー4/5の第1打を計測時に自動で1Wに設定 / false=手動選択または未設定';
