alter table public.profiles
  add column if not exists line_id text unique;

create index if not exists profiles_line_id_idx on public.profiles (line_id);
