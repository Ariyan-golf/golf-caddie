-- v4: profiles に category / birth_date / gender を追加
-- 「飛ばしっこごっこ」イベントの6区分ランキング集計用
--   プロ男女 / 一般男女 / シニア男女(55歳〜)
-- 55歳判定は集計時に birth_date から動的計算する。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender text;

-- CHECK制約（既存ユーザーは NULL 許容、新規はアプリ側で必須化）
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_category_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_category_check
  CHECK (category IS NULL OR category IN ('pro_coach', 'amateur'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('male', 'female', 'undisclosed'));

-- ランキング集計用の複合インデックス
CREATE INDEX IF NOT EXISTS profiles_category_gender_idx
  ON public.profiles (category, gender);

-- handle_new_user(): raw_user_meta_data から category / birth_date / gender を取り込む
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_invite_code     text;
  v_role            text := 'general';
  v_graduation_year integer;
  v_plan            text := 'free';
  v_category        text;
  v_birth_date      date;
  v_gender          text;
BEGIN
  v_invite_code := new.raw_user_meta_data->>'invite_code';

  IF v_invite_code IS NOT NULL THEN
    SELECT ic.role, ic.graduation_year, ic.plan
      INTO v_role, v_graduation_year, v_plan
    FROM public.invite_codes ic
    WHERE ic.code = v_invite_code;

    IF v_role IS NULL THEN
      v_role := 'general';
      v_plan := 'free';
    END IF;
  END IF;

  v_category := nullif(new.raw_user_meta_data->>'category', '');
  v_gender   := nullif(new.raw_user_meta_data->>'gender', '');

  -- birth_date は不正な文字列だと例外になるので個別にガード
  BEGIN
    v_birth_date := (new.raw_user_meta_data->>'birth_date')::date;
  EXCEPTION WHEN others THEN
    v_birth_date := NULL;
  END;

  -- CHECK制約に反する値は NULL に落としておく
  IF v_category IS NOT NULL AND v_category NOT IN ('pro_coach', 'amateur') THEN
    v_category := NULL;
  END IF;
  IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'undisclosed') THEN
    v_gender := NULL;
  END IF;

  INSERT INTO public.profiles (
    id, display_name, is_beta_user, beta_expires_at,
    role, invite_code, graduation_year, plan,
    category, birth_date, gender
  )
  VALUES (
    new.id,
    new.raw_user_meta_data->>'display_name',
    true,
    now() + interval '90 days',
    v_role,
    v_invite_code,
    v_graduation_year,
    coalesce(v_plan, 'free'),
    v_category,
    v_birth_date,
    v_gender
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
