-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  handicap numeric(4, 1),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Club averages per user
create table public.club_averages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  club text not null,
  average_distance_meters numeric(6, 1) not null default 0,
  shot_count integer not null default 0,
  updated_at timestamptz default now(),
  unique(user_id, club)
);

alter table public.club_averages enable row level security;

create policy "Users can manage own club averages"
  on public.club_averages for all
  using (auth.uid() = user_id);

-- Rounds
create table public.rounds (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  course_name text not null,
  date date not null default current_date,
  total_score integer,
  notes text,
  created_at timestamptz default now()
);

alter table public.rounds enable row level security;

create policy "Users can manage own rounds"
  on public.rounds for all
  using (auth.uid() = user_id);

-- Holes
create table public.holes (
  id uuid default uuid_generate_v4() primary key,
  round_id uuid references public.rounds on delete cascade not null,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 5),
  score integer,
  distance_yards integer,
  unique(round_id, hole_number)
);

alter table public.holes enable row level security;

create policy "Users can manage holes in own rounds"
  on public.holes for all
  using (
    exists (
      select 1 from public.rounds
      where rounds.id = holes.round_id
        and rounds.user_id = auth.uid()
    )
  );

-- Shots
create table public.shots (
  id uuid default uuid_generate_v4() primary key,
  hole_id uuid references public.holes on delete cascade not null,
  round_id uuid references public.rounds on delete cascade not null,
  shot_number integer not null,
  club text not null,
  start_lat numeric(10, 7),
  start_lng numeric(10, 7),
  end_lat numeric(10, 7),
  end_lng numeric(10, 7),
  distance_meters numeric(6, 1),
  distance_yards integer,
  notes text,
  created_at timestamptz default now()
);

alter table public.shots enable row level security;

create policy "Users can manage shots in own rounds"
  on public.shots for all
  using (
    exists (
      select 1 from public.rounds
      where rounds.id = shots.round_id
        and rounds.user_id = auth.uid()
    )
  );

-- Swing analyses
create table public.swing_analyses (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  shot_id uuid references public.shots on delete set null,
  analysis_result text not null,
  tips jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table public.swing_analyses enable row level security;

create policy "Users can manage own swing analyses"
  on public.swing_analyses for all
  using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update club averages after a shot is recorded
create or replace function public.update_club_average()
returns trigger as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.rounds where id = new.round_id;

  if new.distance_meters is not null then
    insert into public.club_averages (user_id, club, average_distance_meters, shot_count)
    values (v_user_id, new.club, new.distance_meters, 1)
    on conflict (user_id, club) do update set
      average_distance_meters = (
        (club_averages.average_distance_meters * club_averages.shot_count + new.distance_meters)
        / (club_averages.shot_count + 1)
      ),
      shot_count = club_averages.shot_count + 1,
      updated_at = now();
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_shot_created
  after insert on public.shots
  for each row execute procedure public.update_club_average();
