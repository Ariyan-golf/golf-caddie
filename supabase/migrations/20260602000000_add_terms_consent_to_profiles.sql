-- 20260602000000_add_terms_consent_to_profiles.sql
--
-- 目的：
--   1. profiles に利用規約・プライバシーポリシーの同意記録列を追加する。
--   2. handle_new_user() を拡張し、登録時に raw_user_meta_data の
--      terms_version / privacy_version を取り込み、同意日時を now() で記録する。
--
-- 冪等性：ADD COLUMN IF NOT EXISTS と CREATE OR REPLACE で構成。再適用しても安全。
-- ※ handle_new_user の既存ロジック（invite_code/role/graduation_year/plan/
--    category/birth_date/gender/is_beta_user/beta_expires_at 等）は一切変更せず、
--    同意項目の取り込みのみを追加している。

-- 1. 同意記録列を追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_agreed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version     text,
  ADD COLUMN IF NOT EXISTS privacy_agreed_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_version   text;

-- 2. handle_new_user(): 既存処理に加え、同意の版・日時を取り込む
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
  v_terms_version   text;
  v_privacy_version text;
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

  -- 同意の版（登録フォームから渡される）。空文字は NULL に正規化。
  v_terms_version   := nullif(new.raw_user_meta_data->>'terms_version', '');
  v_privacy_version := nullif(new.raw_user_meta_data->>'privacy_version', '');

  INSERT INTO public.profiles (
    id, display_name, is_beta_user, beta_expires_at,
    role, invite_code, graduation_year, plan,
    category, birth_date, gender,
    terms_version, privacy_version, terms_agreed_at, privacy_agreed_at
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
    v_gender,
    v_terms_version,
    v_privacy_version,
    (CASE WHEN v_terms_version   IS NOT NULL THEN now() ELSE NULL END),
    (CASE WHEN v_privacy_version IS NOT NULL THEN now() ELSE NULL END)
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
