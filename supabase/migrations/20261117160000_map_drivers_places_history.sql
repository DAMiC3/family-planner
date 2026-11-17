-- Family Planner: map locations + drivers on events, private saved places, change history.

-- ===========================================================================
-- 1. Event locations (for the map) and drivers
-- ===========================================================================
alter table family_planner.events
  add column lat double precision check (lat is null or lat between -90 and 90),
  add column lng double precision check (lng is null or lng between -180 and 180),
  add column driver_id uuid references auth.users (id) on delete set null;
create index events_driver_idx on family_planner.events (driver_id);

-- Only parents may assign drivers, and the driver must be in the family.
create or replace function family_planner.guard_event_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.driver_id is not null)
     or (tg_op = 'UPDATE' and new.driver_id is distinct from old.driver_id) then
    if not family_planner.is_family_parent(new.family_id) then
      raise exception 'Only parents can assign drivers';
    end if;
    if new.driver_id is not null and not exists (
      select 1 from family_planner.family_members m where m.family_id = new.family_id and m.user_id = new.driver_id
    ) then
      raise exception 'The driver must be in your family';
    end if;
  end if;
  return new;
end;
$$;
create trigger events_guard_driver before insert or update on family_planner.events
  for each row execute function family_planner.guard_event_driver();

-- Notifications: add "you're driving" to the existing event trigger.
create or replace function family_planner.on_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_who text := family_planner.member_name(new.family_id, v_actor);
  v_choice text;
begin
  if tg_op = 'INSERT' and new.kind = 'slot' then
    perform family_planner.notify_family(new.family_id, v_actor, false, 'slot',
      'New activity slot: ' || new.title, v_who || ' wants ideas — add what you''d like to do.', '/calendar/');
  elsif new.assigned_to is not null and new.assigned_to is distinct from v_actor
        and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform family_planner.notify(new.assigned_to, new.family_id, 'event',
      'New on your program: ' || new.title, 'Added by ' || v_who, '/program/');
  end if;

  if new.driver_id is not null and new.driver_id is distinct from v_actor
     and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    perform family_planner.notify(new.driver_id, new.family_id, 'driver',
      'You''re driving: ' || new.title,
      coalesce(new.location, 'See the map') || ' · assigned by ' || v_who, '/map/');
  end if;

  if tg_op = 'UPDATE' and new.chosen_request_id is not null
     and new.chosen_request_id is distinct from old.chosen_request_id then
    select r.title into v_choice from family_planner.activity_requests r where r.id = new.chosen_request_id;
    perform family_planner.notify_family(new.family_id, v_actor, false, 'slot_decided',
      'Decided: ' || v_choice, 'Plan for "' || new.title || '"', '/calendar/');
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. Saved places — private to each person (Home + favourites)
-- ===========================================================================
create table family_planner.saved_places (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  address    text not null check (char_length(address) between 1 and 300),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  is_home    boolean not null default false,
  created_at timestamptz not null default now()
);
create index saved_places_user_idx on family_planner.saved_places (user_id);
create unique index saved_places_one_home on family_planner.saved_places (user_id) where is_home;

alter table family_planner.saved_places enable row level security;
create policy "own places only" on family_planner.saved_places
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on family_planner.saved_places to authenticated;
grant all on family_planner.saved_places to service_role;

-- ===========================================================================
-- 3. Change history: who changed what, when, and what it was before
-- ===========================================================================
create table family_planner.change_log (
  id         bigint generated always as identity primary key,
  family_id  uuid not null references family_planner.families (id) on delete cascade,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  old_data   jsonb,
  new_data   jsonb
);
create index change_log_family_idx     on family_planner.change_log (family_id, changed_at desc);
create index change_log_changed_by_idx on family_planner.change_log (changed_by);

create or replace function family_planner.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_family uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  -- Ignore updates that only touched updated_at.
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return null;
  end if;
  v_row := coalesce(v_new, v_old);
  v_family := case when tg_table_name = 'families' then (v_row ->> 'id')::uuid else (v_row ->> 'family_id')::uuid end;
  -- Skip when the whole family is being deleted.
  if v_family is null or not exists (select 1 from family_planner.families f where f.id = v_family) then
    return null;
  end if;
  insert into family_planner.change_log (family_id, table_name, row_id, action, changed_by, old_data, new_data)
  values (
    v_family, tg_table_name,
    coalesce(v_row ->> 'id', (v_row ->> 'family_id') || ':' || (v_row ->> 'user_id')),
    lower(tg_op), auth.uid(), v_old, v_new);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['families', 'family_members', 'events', 'tasks', 'meals', 'shopping_items',
                           'member_rules', 'activity_requests', 'invites'] loop
    execute format(
      'create trigger %I after insert or update or delete on family_planner.%I for each row execute function family_planner.log_change()',
      t || '_log_change', t);
  end loop;
end;
$$;

alter table family_planner.change_log enable row level security;
create policy "parents can read history" on family_planner.change_log
  for select to authenticated using (family_planner.is_family_parent(family_id));
grant select on family_planner.change_log to authenticated;
grant all on family_planner.change_log to service_role;

revoke execute on function family_planner.guard_event_driver(), family_planner.log_change() from public, anon, authenticated;
