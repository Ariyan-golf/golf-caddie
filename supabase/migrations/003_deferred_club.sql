-- club is now filled in after the shot (deferred entry)
alter table public.shots alter column club drop not null;

-- Trigger: update club averages when club is assigned to a shot that already has a distance
create or replace function public.update_club_average_on_assign()
returns trigger as $$
declare
  v_user_id uuid;
begin
  -- Only when both club and distance are present
  if new.club is null or new.distance_meters is null then return new; end if;
  -- Only when club actually changed (newly assigned)
  if old.club is not distinct from new.club then return new; end if;

  select user_id into v_user_id from public.rounds where id = new.round_id;

  insert into public.club_averages (user_id, club, average_distance_meters, shot_count)
  values (v_user_id, new.club, new.distance_meters, 1)
  on conflict (user_id, club) do update set
    average_distance_meters = (
      (club_averages.average_distance_meters * club_averages.shot_count + new.distance_meters)
      / (club_averages.shot_count + 1)
    ),
    shot_count = club_averages.shot_count + 1,
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer;

create trigger on_club_assigned
  after update on public.shots
  for each row execute procedure public.update_club_average_on_assign();
