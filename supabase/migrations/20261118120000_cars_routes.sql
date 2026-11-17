-- Family Planner: cars, car assignment on events (with permission), "be there by" times,
-- default-car auto-assignment, and a parent task for trips that have no car.

-- ===========================================================================
-- 1. Cars
-- ===========================================================================
create table family_planner.cars (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references family_planner.families (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_default boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index cars_family_idx on family_planner.cars (family_id);
create index cars_created_by_idx on family_planner.cars (created_by);
create unique index cars_one_default on family_planner.cars (family_id) where is_default;

alter table family_planner.cars enable row level security;
create policy "members can view cars" on family_planner.cars for select to authenticated
  using (family_planner.is_family_member(family_id));
create policy "parents add cars" on family_planner.cars for insert to authenticated
  with check (family_planner.is_family_parent(family_id));
create policy "parents change cars" on family_planner.cars for update to authenticated
  using (family_planner.is_family_parent(family_id)) with check (family_planner.is_family_parent(family_id));
create policy "parents remove cars" on family_planner.cars for delete to authenticated
  using (family_planner.is_family_parent(family_id));
grant select, insert, update, delete on family_planner.cars to authenticated;
grant all on family_planner.cars to service_role;

-- ===========================================================================
-- 2. New columns
-- ===========================================================================
alter table family_planner.families
  add column car_auto_assign_hours smallint not null default 24 check (car_auto_assign_hours between 0 and 168);
grant update (car_auto_assign_hours) on family_planner.families to authenticated;

alter table family_planner.family_members
  add column can_assign_cars boolean not null default false;
grant update (can_assign_cars) on family_planner.family_members to authenticated;

alter table family_planner.events
  add column car_id uuid references family_planner.cars (id) on delete set null,
  add column arrive_by timestamptz;
create index events_car_idx on family_planner.events (car_id);

alter table family_planner.tasks
  add column event_id uuid references family_planner.events (id) on delete cascade;
create unique index tasks_one_per_event on family_planner.tasks (event_id) where event_id is not null;

-- Only parents change roles, event permissions and car permissions.
create or replace function family_planner.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.family_id <> old.family_id or new.user_id <> old.user_id then
    raise exception 'family_id and user_id cannot be changed';
  end if;
  if (new.role is distinct from old.role
      or new.event_permission is distinct from old.event_permission
      or new.can_assign_cars is distinct from old.can_assign_cars)
     and auth.uid() is not null and not family_planner.is_family_parent(old.family_id) then
    raise exception 'Only parents can change roles and permissions';
  end if;
  if new.role is distinct from old.role and old.role = 'parent' and not exists (
    select 1 from family_planner.family_members m
    where m.family_id = old.family_id and m.role = 'parent' and m.user_id <> old.user_id
  ) then
    raise exception 'The family needs at least one parent';
  end if;
  return new;
end;
$$;

-- Car on an event: parents, or members a parent allowed; the car must be the family's.
create or replace function family_planner.guard_event_car()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.car_id is not null)
     or (tg_op = 'UPDATE' and new.car_id is distinct from old.car_id) then
    if new.car_id is not null and not exists (
      select 1 from family_planner.cars c where c.id = new.car_id and c.family_id = new.family_id
    ) then
      raise exception 'That car is not in your family';
    end if;
    if auth.uid() is not null and not family_planner.is_family_parent(new.family_id) and not exists (
      select 1 from family_planner.family_members m
      where m.family_id = new.family_id and m.user_id = auth.uid() and m.can_assign_cars
    ) then
      raise exception 'A parent has to give you permission to choose cars';
    end if;
  end if;
  return new;
end;
$$;
create trigger events_guard_car before insert or update on family_planner.events
  for each row execute function family_planner.guard_event_car();

-- ===========================================================================
-- 3. Trips without a car → a task for a parent (closed automatically once a car is set)
-- ===========================================================================
create or replace function family_planner.sync_car_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid;
  v_tz text;
begin
  if new.kind = 'event' and new.status = 'approved' and new.lat is not null
     and new.car_id is null and new.starts_at > now() then
    if exists (select 1 from family_planner.tasks t where t.event_id = new.id) then
      update family_planner.tasks
         set completed_at = null, completed_by = null
       where event_id = new.id and completed_at is not null;
    else
      select m.user_id into v_parent from family_planner.family_members m
       where m.family_id = new.family_id and m.role = 'parent'
       order by (m.user_id = new.created_by) desc, m.joined_at
       limit 1;
      select f.timezone into v_tz from family_planner.families f where f.id = new.family_id;
      if v_parent is not null then
        insert into family_planner.tasks (family_id, title, notes, due_date, assigned_to, event_id, created_by)
        values (new.family_id, left('Assign a car: ' || new.title, 200),
                'This trip has no car yet — pick one on the Map tab or in the event.',
                (new.starts_at at time zone v_tz)::date, v_parent, new.id, v_parent);
      end if;
    end if;
  else
    update family_planner.tasks
       set completed_at = now(), completed_by = auth.uid()
     where event_id = new.id and completed_at is null;
  end if;
  return new;
end;
$$;
create trigger events_sync_car_task after insert or update on family_planner.events
  for each row execute function family_planner.sync_car_task();

-- ===========================================================================
-- 4. Default car: assigned automatically when nobody picked a car in time
-- ===========================================================================
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
     and e.starts_at <= now() + make_interval(hours => f.car_auto_assign_hours);
  get diagnostics n = row_count;
  return n;
end;
$$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('family-planner-default-cars', '*/10 * * * *', $$select family_planner.auto_assign_default_cars()$$);

-- ===========================================================================
-- 5. History, realtime, privileges
-- ===========================================================================
create trigger cars_log_change after insert or update or delete on family_planner.cars
  for each row execute function family_planner.log_change();
alter publication supabase_realtime add table family_planner.cars;

revoke execute on function family_planner.guard_event_car(), family_planner.sync_car_task(),
  family_planner.auto_assign_default_cars() from public, anon, authenticated;
grant execute on function family_planner.auto_assign_default_cars() to service_role;
