create table public.round_payments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  amount integer not null,
  golf_course text,
  stripe_session_id text unique,
  created_at timestamptz default now()
);

alter table public.round_payments enable row level security;

create policy "Users can view own round payments"
  on public.round_payments for select
  using (auth.uid() = user_id);
