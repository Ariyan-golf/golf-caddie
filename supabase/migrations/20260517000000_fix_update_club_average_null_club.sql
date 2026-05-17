-- Fix: update_club_average() must skip when shots.club is NULL.
--
-- Background:
--   migration 003_deferred_club.sql made shots.club nullable to support the
--   post-round input flow (club is filled in later via on_club_assigned
--   AFTER UPDATE trigger). However the original AFTER INSERT trigger function
--   update_club_average() from 001_initial_schema.sql was never updated to
--   handle a NULL club. As a result, every shot insert with distance_meters
--   set and club NULL violated club_averages.club NOT NULL, crashed the
--   trigger, and atomically rolled back the entire shot insert — silently
--   from the user's perspective.
--
-- Effect:
--   With this guard in place, shot inserts with NULL club succeed (the row
--   lands in shots, club_averages is left alone). Once the user assigns a
--   club via UnfilledShotsSection (or the recording flow supplies one
--   directly), on_club_assigned fires and updates club_averages.

create or replace function public.update_club_average()
returns trigger as $$
declare
  v_user_id uuid;
begin
  -- Skip rows that don't yet have a club (filled in later).
  if new.club is null then return new; end if;

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
