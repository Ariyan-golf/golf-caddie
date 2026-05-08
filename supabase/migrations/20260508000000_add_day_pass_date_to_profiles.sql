alter table public.profiles
  add column if not exists day_pass_date date;

create index if not exists profiles_day_pass_date_idx on public.profiles (day_pass_date);
