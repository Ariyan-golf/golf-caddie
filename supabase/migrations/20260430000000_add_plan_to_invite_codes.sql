-- Add plan and label columns to invite_codes
alter table public.invite_codes
  add column if not exists plan text not null default 'free',
  add column if not exists label text;

-- Update handle_new_user to apply plan from invite code at signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_invite_code text;
  v_role text := 'general';
  v_graduation_year integer;
  v_plan text := 'free';
begin
  v_invite_code := new.raw_user_meta_data->>'invite_code';

  if v_invite_code is not null then
    select ic.role, ic.graduation_year, ic.plan
      into v_role, v_graduation_year, v_plan
    from public.invite_codes ic
    where ic.code = v_invite_code;

    if v_role is null then
      v_role  := 'general';
      v_plan  := 'free';
    end if;
  end if;

  insert into public.profiles (
    id, display_name, is_beta_user, beta_expires_at,
    role, invite_code, graduation_year, plan
  )
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    true,
    now() + interval '90 days',
    v_role,
    v_invite_code,
    v_graduation_year,
    coalesce(v_plan, 'free')
  );

  return new;
end;
$$ language plpgsql security definer;
