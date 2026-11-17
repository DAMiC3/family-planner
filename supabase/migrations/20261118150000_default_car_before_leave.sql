-- Default car is assigned N hours (default 2) before the time someone has to LEAVE for the trip.
-- leave_by is estimated by the app when the event is saved (be-there-by minus the drive from home).
alter table family_planner.events add column leave_by timestamptz;

alter table family_planner.families alter column car_auto_assign_hours set default 2;
update family_planner.families set car_auto_assign_hours = 2 where car_auto_assign_hours = 24;

create or replace function family_planner.auto_assign_default_cars()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update family_planner.events e
     set car_id = c.id
    from family_planner.cars c
    join family_planner.families f on f.id = c.family_id
   where c.family_id = e.family_id
     and c.is_default
     and e.car_id is null
     and e.kind = 'event'
     and e.status = 'approved'
     and e.lat is not null
     and e.starts_at > now()
     and coalesce(e.leave_by, e.arrive_by, e.starts_at) <= now() + make_interval(hours => f.car_auto_assign_hours);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function family_planner.auto_assign_default_cars() from public, anon, authenticated;
