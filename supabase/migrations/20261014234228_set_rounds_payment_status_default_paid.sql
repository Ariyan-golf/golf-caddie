-- rounds.payment_status: 初期値を 'paid' に変更し、既存の 'pending' をすべて 'paid' に更新する。
--
-- Background:
--   20260509000000_add_payment_status_to_rounds.sql で payment_status は既定値 'pending' で
--   追加された。ラウンド作成時に値を指定しない経路（通常のラウンド開始）は 'pending' で作られ、
--   停止中の削除 cron（cleanup-pending-rounds）を再開すると通常ラウンドまで消える構造だった。
--   現在の全機能を無料で提供するため、未決済という状態自体を使わない。
--
-- Note:
--   CHECK 制約（'pending' / 'paid'）はそのまま残す（将来の有料追加機能で使う可能性があるため）。
--   SQL Editor は最後の SELECT の結果だけを表示する。更新前の件数は、実行前に
--   同じ集計 SELECT を単独で実行して確認すること。

BEGIN;

-- 更新前の件数
SELECT payment_status, COUNT(*) AS rounds
FROM public.rounds
GROUP BY payment_status
ORDER BY payment_status;

ALTER TABLE public.rounds
  ALTER COLUMN payment_status SET DEFAULT 'paid';

UPDATE public.rounds
   SET payment_status = 'paid'
 WHERE payment_status = 'pending';

-- 更新後の件数（'pending' が 0 件＝表示されないこと）
SELECT payment_status, COUNT(*) AS rounds
FROM public.rounds
GROUP BY payment_status
ORDER BY payment_status;

COMMIT;
