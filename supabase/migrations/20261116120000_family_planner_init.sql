-- Family Planner: initial schema
-- Lives in its own `family_planner` schema so it never collides with other
-- apps sharing this Supabase project. Every table is scoped to a family and
-- protected by RLS: you can only see/change rows for families you belong to.

create schema if not exists family_planner;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type family_planner.member_role as enum ('owner', 'adult', 'child');
create type family_planner.meal_type   as enum ('breakfast', 'lunch', 'dinner', 'snack');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function family_planner.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function family_planner.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table family_planner.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default family_planner.generate_invite_code(),
  timezone    text not null default 'UTC',
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table family_planner.family_members (
  family_id    uuid not null references family_planner.families (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  role         family_planner.member_role not null default 'adult',
  color        text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at    timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_id_idx on family_planner.family_members (user_id);

create table family_planner.events (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references family_planner.families (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text,
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  assigned_to uuid references auth.users (id) on delete set null,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index events_family_starts_idx on family_planner.events (family_id, starts_at);
create index events_assigned_to_idx   on family_planner.events (assigned_to);
create index events_created_by_idx    on family_planner.events (created_by);

create table family_planner.tasks (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references family_planner.families (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  notes        text,
  due_date     date,
  points       integer not null default 0 check (points >= 0),
  assigned_to  uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  created_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_family_due_idx    on family_planner.tasks (family_id, due_date);
create index tasks_assigned_to_idx   on family_planner.tasks (assigned_to);
create index tasks_completed_by_idx  on family_planner.tasks (completed_by);
create index tasks_created_by_idx    on family_planner.tasks (created_by);

create table family_planner.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references family_planner.families (id) on delete cascade,
  name       text not null default 'Groceries' check (char_length(name) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index shopping_lists_family_idx     on family_planner.shopping_lists (family_id);
create index shopping_lists_created_by_idx on family_planner.shopping_lists (created_by);

create table family_planner.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references family_planner.shopping_lists (id) on delete cascade,
  family_id  uuid not null references family_planner.families (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  quantity   text,
  checked    boolean not null default false,
  added_by   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index shopping_items_list_idx     on family_planner.shopping_items (list_id, checked);
create index shopping_items_family_idx   on family_planner.shopping_items (family_id);
create index shopping_items_added_by_idx on family_planner.shopping_items (added_by);

create table family_planner.meals (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references family_planner.families (id) on delete cascade,
  date       date not null,
  meal_type  family_planner.meal_type not null default 'dinner',
  title      text not null check (char_length(title) between 1 and 200),
  notes      text,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index meals_family_date_idx on family_planner.meals (family_id, date);
create index meals_created_by_idx  on family_planner.meals (created_by);

create trigger families_updated_at before update on family_planner.families
  for each row execute function family_planner.set_updated_at();
create trigger events_updated_at before update on family_planner.events
  for each row execute function family_planner.set_updated_at();
create trigger tasks_updated_at before update on family_planner.tasks
  for each row execute function family_planner.set_updated_at();

-- Shopping items must belong to the same family as their list.
create or replace function family_planner.shopping_item_family_matches_list()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from family_planner.shopping_lists l
    where l.id = new.list_id and l.family_id = new.family_id
  ) then
    raise exception 'shopping item family_id does not match its list';
  end if;
  return new;
end;
$$;
create trigger shopping_items_family_check before insert or update on family_planner.shopping_items
  for each row execute function family_planner.shopping_item_family_matches_list();

-- ---------------------------------------------------------------------------
-- Membership checks used by RLS (security definer avoids RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function family_planner.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from family_planner.family_members m
    where m.family_id = p_family_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function family_planner.is_family_owner(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from family_planner.family_members m
    where m.family_id = p_family_id and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RPCs: creating and joining families (the only way to add memberships)
-- ---------------------------------------------------------------------------
create or replace function family_planner.create_family(p_name text, p_display_name text)
returns family_planner.families
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family family_planner.families;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into family_planner.families (name, created_by)
  values (trim(p_name), v_uid)
  returning * into v_family;

  insert into family_planner.family_members (family_id, user_id, display_name, role)
  values (v_family.id, v_uid, trim(p_display_name), 'owner');

  insert into family_planner.shopping_lists (family_id, name, created_by)
  values (v_family.id, 'Groceries', v_uid);

  return v_family;
end;
$$;

create or replace function family_planner.join_family(p_invite_code text, p_display_name text)
returns family_planner.families
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family family_planner.families;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_family
  from family_planner.families
  where invite_code = upper(trim(p_invite_code));

  if v_family.id is null then
    raise exception 'invalid invite code';
  end if;

  insert into family_planner.family_members (family_id, user_id, display_name, role)
  values (v_family.id, v_uid, trim(p_display_name), 'adult')
  on conflict (family_id, user_id) do nothing;

  return v_family;
end;
$$;

create or replace function family_planner.regenerate_invite_code(p_family_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not family_planner.is_family_owner(p_family_id) then
    raise exception 'only the family owner can do this';
  end if;
  update family_planner.families
     set invite_code = family_planner.generate_invite_code()
   where id = p_family_id
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table family_planner.families       enable row level security;
alter table family_planner.family_members enable row level security;
alter table family_planner.events         enable row level security;
alter table family_planner.tasks          enable row level security;
alter table family_planner.shopping_lists enable row level security;
alter table family_planner.shopping_items enable row level security;
alter table family_planner.meals          enable row level security;

-- families: members read; owner updates/deletes; inserts only via create_family()
create policy "members can view their families" on family_planner.families
  for select to authenticated using (family_planner.is_family_member(id));
create policy "owners can update their family" on family_planner.families
  for update to authenticated
  using (family_planner.is_family_owner(id)) with check (family_planner.is_family_owner(id));
create policy "owners can delete their family" on family_planner.families
  for delete to authenticated using (family_planner.is_family_owner(id));

-- family_members: see fellow members; edit yourself (owners edit anyone);
-- leave yourself (owners remove anyone); inserts only via RPCs
create policy "members can view fellow members" on family_planner.family_members
  for select to authenticated using (family_planner.is_family_member(family_id));
create policy "members update self, owners update anyone" on family_planner.family_members
  for update to authenticated
  using (user_id = (select auth.uid()) or family_planner.is_family_owner(family_id))
  with check (user_id = (select auth.uid()) or family_planner.is_family_owner(family_id));
create policy "members leave, owners remove" on family_planner.family_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or family_planner.is_family_owner(family_id));

-- Non-owners may not promote themselves: role changes require ownership.
create or replace function family_planner.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and not family_planner.is_family_owner(old.family_id) then
    raise exception 'only the family owner can change roles';
  end if;
  if new.family_id <> old.family_id or new.user_id <> old.user_id then
    raise exception 'family_id and user_id cannot be changed';
  end if;
  return new;
end;
$$;
create trigger family_members_guard_role before update on family_planner.family_members
  for each row execute function family_planner.guard_member_role();

-- Shared content tables: any family member has full access to their family's rows.
do $$
declare
  t text;
begin
  foreach t in array array['events', 'tasks', 'shopping_lists', 'shopping_items', 'meals'] loop
    execute format(
      'create policy "members can view" on family_planner.%I for select to authenticated using (family_planner.is_family_member(family_id))', t);
    execute format(
      'create policy "members can insert" on family_planner.%I for insert to authenticated with check (family_planner.is_family_member(family_id))', t);
    execute format(
      'create policy "members can update" on family_planner.%I for update to authenticated using (family_planner.is_family_member(family_id)) with check (family_planner.is_family_member(family_id))', t);
    execute format(
      'create policy "members can delete" on family_planner.%I for delete to authenticated using (family_planner.is_family_member(family_id))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: signed-in users only (anon gets nothing)
-- ---------------------------------------------------------------------------
grant usage on schema family_planner to authenticated, service_role;

grant select, insert, update, delete on all tables in schema family_planner to authenticated;
grant all on all tables in schema family_planner to service_role;
-- Direct inserts into families/family_members are not allowed; use the RPCs.
-- Updates are limited to the columns people should be able to edit.
revoke insert, update on family_planner.families, family_planner.family_members from authenticated;
grant update (name, timezone) on family_planner.families to authenticated;
grant update (display_name, color, role) on family_planner.family_members to authenticated;

revoke execute on all functions in schema family_planner from public, anon;
grant execute on function family_planner.create_family(text, text)       to authenticated;
grant execute on function family_planner.join_family(text, text)         to authenticated;
grant execute on function family_planner.regenerate_invite_code(uuid)    to authenticated;
grant execute on function family_planner.is_family_member(uuid)          to authenticated;
grant execute on function family_planner.is_family_owner(uuid)           to authenticated;
grant all on all functions in schema family_planner to service_role;

alter default privileges in schema family_planner revoke execute on functions from public, anon;

-- Realtime: stream changes to family members (RLS still applies)
alter publication supabase_realtime add table
  family_planner.events,
  family_planner.tasks,
  family_planner.shopping_items,
  family_planner.meals;
