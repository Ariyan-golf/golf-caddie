-- ドライバーを表す club 値の正規化
--   背景: HoleRecorder.tsx の飛距離計測ダイアログが select の value を 'driver' で
--   持っていたため、shots / shot_distances に 'driver' と '1w' の2系統が混在していた。
--   types/index.ts の CLUBS 型に合わせて '1w' に統一する（コード側も同コミットで修正）。
--
--   idempotent: WHERE 句で対象行を絞っているため複数回流しても安全。

UPDATE public.shots          SET club = '1w' WHERE club = 'driver';
UPDATE public.shot_distances SET club = '1w' WHERE club = 'driver';
