-- Add beta user management fields to profiles
alter table public.profiles
  add column if not exists is_beta_user boolean not null default true,
  add column if not exists beta_expires_at timestamptz not null default (now() + interval '90 days'),
  add column if not exists updated_at timestamptz default now();

-- Function to auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- Update handle_new_user to set beta expiry on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, is_beta_user, beta_expires_at)
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    true,
    now() + interval '90 days'
  );
  return new;
end;
$$ language plpgsql security definer;

-- View: active beta users (not expired)
create or replace view public.active_beta_users as
  select id, display_name, handicap, beta_expires_at
  from public.profiles
  where is_beta_user = true
    and beta_expires_at > now();

-- Function: check if current user's beta is valid
create or replace function public.is_beta_valid()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_beta_user = true
      and beta_expires_at > now()
  );
$$ language sql security definer;

-- Add insert policy for profiles (admin use)
create policy "Service role can insert profiles"
  on public.profiles for insert
  with check (true);

-- Performance indexes
create index if not exists idx_rounds_user_id_date on public.rounds(user_id, date desc);
create index if not exists idx_holes_round_id on public.holes(round_id);
create index if not exists idx_shots_round_id on public.shots(round_id);
create index if not exists idx_shots_hole_id on public.shots(hole_id);
create index if not exists idx_club_averages_user_id on public.club_averages(user_id);
create index if not exists idx_profiles_beta on public.profiles(is_beta_user, beta_expires_at);
