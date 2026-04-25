-- Add putts column to holes
alter table public.holes
  add column if not exists putts integer check (putts between 1 and 10);

-- Add lie_type column to shots
alter table public.shots
  add column if not exists lie_type text
    check (lie_type in ('tee','fw','rough','ob','bunker','trees','green','other'));
