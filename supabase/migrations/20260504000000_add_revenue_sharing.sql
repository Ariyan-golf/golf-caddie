-- ① referrals（紹介関係）
create table if not exists public.referrals (
  id               uuid default uuid_generate_v4() primary key,
  referrer_id      uuid references auth.users on delete cascade not null,
  referred_user_id uuid references auth.users on delete cascade not null,
  created_at       timestamptz default now(),
  unique (referred_user_id)        -- 1ユーザーは1人からしか紹介されない
);

-- ② golf_course_agents（営業者とゴルフ場の紐付け）
create table if not exists public.golf_course_agents (
  id             uuid default uuid_generate_v4() primary key,
  agent_user_id  uuid references auth.users on delete cascade not null,
  golf_course_id text not null,
  created_at     timestamptz default now(),
  unique (agent_user_id, golf_course_id)
);

-- ③ round_revenue（ラウンド毎の収益記録）
create table if not exists public.round_revenue (
  id             uuid default uuid_generate_v4() primary key,
  round_id       uuid references public.rounds on delete cascade not null,
  user_id        uuid references auth.users on delete cascade not null,
  golf_course_id text,
  referrer_id    uuid references auth.users on delete set null,
  agent_id       uuid references auth.users on delete set null,
  total_amount   integer not null default 0,   -- 単位: 円
  course_share   integer not null default 0,   -- ゴルフ場取り分
  referrer_share integer not null default 0,   -- 紹介者取り分
  agent_share    integer not null default 0,   -- 営業者取り分
  company_share  integer not null default 0,   -- 自社取り分
  created_at     timestamptz default now(),
  unique (round_id)
);

-- RLS 有効化
alter table public.referrals        enable row level security;
alter table public.golf_course_agents enable row level security;
alter table public.round_revenue    enable row level security;

-- ─── referrals ポリシー ────────────────────────────────────────────
create policy "Admin can manage referrals"
  on public.referrals for all
  using ((select email from auth.users where id = auth.uid()) = 't.a.0903076959@i.softbank.jp');

create policy "Referrers can view own referrals"
  on public.referrals for select
  using (auth.uid() = referrer_id);

-- ─── golf_course_agents ポリシー ──────────────────────────────────
create policy "Admin can manage golf_course_agents"
  on public.golf_course_agents for all
  using ((select email from auth.users where id = auth.uid()) = 't.a.0903076959@i.softbank.jp');

create policy "Agents can view own courses"
  on public.golf_course_agents for select
  using (auth.uid() = agent_user_id);

-- ─── round_revenue ポリシー ───────────────────────────────────────
create policy "Admin can manage round_revenue"
  on public.round_revenue for all
  using ((select email from auth.users where id = auth.uid()) = 't.a.0903076959@i.softbank.jp');

create policy "Users can view own revenue records"
  on public.round_revenue for select
  using (auth.uid() = user_id);

create policy "Referrers can view revenue where they are referrer"
  on public.round_revenue for select
  using (auth.uid() = referrer_id);

create policy "Agents can view revenue where they are agent"
  on public.round_revenue for select
  using (auth.uid() = agent_id);
