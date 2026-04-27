-- ① profiles テーブルに新カラム追加
alter table public.profiles
  add column if not exists role text not null default 'general',
  add column if not exists invite_code text,
  add column if not exists graduation_year integer,
  add column if not exists plan text not null default 'free',
  add column if not exists round_count integer not null default 0;

-- ② 招待コードテーブル作成
create table if not exists public.invite_codes (
  id uuid default uuid_generate_v4() primary key,
  code text unique not null,
  role text not null default 'student',
  graduation_year integer,
  created_at timestamptz default now()
);

-- 招待コード初期データ
insert into public.invite_codes (code, role, graduation_year) values
  ('TOKAI2026', 'student', 2026),
  ('TOKAI2027', 'student', 2027),
  ('TOKAI2028', 'student', 2028),
  ('TOKAI2029', 'student', 2029)
on conflict (code) do nothing;

-- invite_codes の RLS（登録時の照合のため全員が読み取り可）
alter table public.invite_codes enable row level security;

create policy "Anyone can read invite codes"
  on public.invite_codes for select
  using (true);

-- ③ profiles の管理者読み取りポリシー追加
create policy "Admin can view all profiles"
  on public.profiles for select
  using (
    (select email from auth.users where id = auth.uid()) = 't.a.0903076959@i.softbank.jp'
  );

-- ④ 管理者用ユーザー一覧取得関数（admin のみ実行可）
create or replace function public.get_admin_user_list()
returns table (
  id uuid,
  display_name text,
  email text,
  invite_code text,
  graduation_year integer,
  round_count integer,
  plan text,
  role text,
  created_at timestamptz
) as $$
begin
  if (select u.email from auth.users u where u.id = auth.uid()) != 't.a.0903076959@i.softbank.jp' then
    raise exception 'Access denied';
  end if;

  return query
  select
    p.id,
    p.display_name,
    u.email,
    p.invite_code,
    p.graduation_year,
    p.round_count,
    p.plan,
    p.role,
    p.created_at
  from public.profiles p
  join auth.users u on p.id = u.id
  order by p.created_at desc;
end;
$$ language plpgsql security definer;

-- handle_new_user: 招待コードからロール・卒業年度を自動設定
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_invite_code text;
  v_role text := 'general';
  v_graduation_year integer;
begin
  v_invite_code := new.raw_user_meta_data->>'invite_code';

  if v_invite_code is not null then
    select ic.role, ic.graduation_year
      into v_role, v_graduation_year
    from public.invite_codes ic
    where ic.code = v_invite_code;

    if v_role is null then
      v_role := 'general';
    end if;
  end if;

  insert into public.profiles (
    id, display_name, is_beta_user, beta_expires_at,
    role, invite_code, graduation_year
  )
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    true,
    now() + interval '90 days',
    v_role,
    v_invite_code,
    v_graduation_year
  );

  return new;
end;
$$ language plpgsql security definer;

-- round_count を rounds テーブルへの insert/delete で自動更新
create or replace function public.update_round_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
    set round_count = round_count + 1
    where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update public.profiles
    set round_count = greatest(round_count - 1, 0)
    where id = old.user_id;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_round_created_or_deleted
  after insert or delete on public.rounds
  for each row execute procedure public.update_round_count();
