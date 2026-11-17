-- Family Planner: roles, activity slots, parental rules, inbox, invites, push, Checkers links.
-- Everything stays inside the `family_planner` schema except enabling the pg_net extension
-- (used to call the push-notification edge function) and two Vault secrets.

-- ===========================================================================
-- 1. Roles: parent / child / other
-- ===========================================================================
alter type family_planner.member_role rename value 'owner' to 'parent';
alter type family_planner.member_role rename value 'adult' to 'other';
alter table family_planner.family_members alter column role set default 'other';

create or replace function family_planner.is_family_parent(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from family_planner.family_members m
    where m.family_id = p_family_id and m.user_id = (select auth.uid()) and m.role = 'parent'
  );
$$;

drop policy "owners can update their family" on family_planner.families;
drop policy "owners can delete their family" on family_planner.families;
drop policy "members update self, owners update anyone" on family_planner.family_members;
drop policy "members leave, owners remove" on family_planner.family_members;

create policy "parents can update their family" on family_planner.families
  for update to authenticated
  using (family_planner.is_family_parent(id)) with check (family_planner.is_family_parent(id));
create policy "parents can delete their family" on family_planner.families
  for delete to authenticated using (family_planner.is_family_parent(id));
create policy "members update self, parents update anyone" on family_planner.family_members
  for update to authenticated
  using (user_id = (select auth.uid()) or family_planner.is_family_parent(family_id))
  with check (user_id = (select auth.uid()) or family_planner.is_family_parent(family_id));
create policy "members leave, parents remove" on family_planner.family_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or family_planner.is_family_parent(family_id));

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
  if new.role is distinct from old.role then
    if auth.uid() is not null and not family_planner.is_family_parent(old.family_id) then
      raise exception 'Only parents can change roles';
    end if;
    if old.role = 'parent' and not exists (
      select 1 from family_planner.family_members m
      where m.family_id = old.family_id and m.role = 'parent' and m.user_id <> old.user_id
    ) then
      raise exception 'The family needs at least one parent';
    end if;
  end if;
  return new;
end;
$$;

-- The last parent can't leave while others are still in the family.
-- (Skipped for admin deletes, e.g. deleting a user account, and when the whole family is deleted.)
create or replace function family_planner.guard_member_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or old.role <> 'parent'
     or not exists (select 1 from family_planner.families f where f.id = old.family_id) then
    return old;
  end if;
  if exists (select 1 from family_planner.family_members m where m.family_id = old.family_id and m.user_id <> old.user_id)
     and not exists (
       select 1 from family_planner.family_members m
       where m.family_id = old.family_id and m.role = 'parent' and m.user_id <> old.user_id
     ) then
    raise exception 'Make someone else a parent before leaving';
  end if;
  return old;
end;
$$;
create trigger family_members_guard_delete before delete on family_planner.family_members
  for each row execute function family_planner.guard_member_delete();

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
  insert into family_planner.families (name, created_by) values (trim(p_name), v_uid) returning * into v_family;
  insert into family_planner.family_members (family_id, user_id, display_name, role)
  values (v_family.id, v_uid, trim(p_display_name), 'parent');
  insert into family_planner.shopping_lists (family_id, name, created_by) values (v_family.id, 'Groceries', v_uid);
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
  select * into v_family from family_planner.families where invite_code = upper(trim(p_invite_code));
  if v_family.id is null then
    raise exception 'invalid invite code';
  end if;
  insert into family_planner.family_members (family_id, user_id, display_name, role)
  values (v_family.id, v_uid, trim(p_display_name), 'other')
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
  if not family_planner.is_family_parent(p_family_id) then
    raise exception 'Only parents can do this';
  end if;
  update family_planner.families set invite_code = family_planner.generate_invite_code()
   where id = p_family_id returning invite_code into v_code;
  return v_code;
end;
$$;

drop function family_planner.is_family_owner(uuid);

-- ===========================================================================
-- 2. Parental rules: block children / others from changing things at certain times
-- ===========================================================================
create type family_planner.rule_area as enum ('everything', 'events', 'tasks', 'shopping', 'meals', 'requests');

create table family_planner.member_rules (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references family_planner.families (id) on delete cascade,
  -- Who: one specific person, or everyone with a role, or (both null) every non-parent.
  target_user uuid references auth.users (id) on delete cascade,
  target_role family_planner.member_role,
  -- What
  area        family_planner.rule_area not null default 'everything',
  -- When (all optional; empty = always). days: 0 = Sunday … 6 = Saturday.
  days        smallint[] check (days is null or days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  start_time  time,
  end_time    time,
  start_date  date,
  end_date    date,
  note        text check (note is null or char_length(note) <= 200),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (target_role is distinct from 'parent'),
  check (target_user is null or target_role is null),
  check ((start_time is null) = (end_time is null)),
  check (start_date is null or end_date is null or end_date >= start_date)
);
create index member_rules_family_idx      on family_planner.member_rules (family_id);
create index member_rules_target_user_idx on family_planner.member_rules (target_user);
create index member_rules_created_by_idx  on family_planner.member_rules (created_by);

-- True when the caller may add/change things in `p_area` right now.
-- Parents always can; everyone else is checked against active rules in the family's timezone.
create or replace function family_planner.can_write(p_family_id uuid, p_area family_planner.rule_area)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role family_planner.member_role;
  v_local timestamp;
begin
  select m.role into v_role from family_planner.family_members m
   where m.family_id = p_family_id and m.user_id = v_uid;
  if v_role is null then
    return false;
  end if;
  if v_role = 'parent' then
    return true;
  end if;
  select now() at time zone f.timezone into v_local from family_planner.families f where f.id = p_family_id;

  return not exists (
    select 1 from family_planner.member_rules r
    where r.family_id = p_family_id
      and (r.area = 'everything' or r.area = p_area)
      and (r.target_user = v_uid or (r.target_user is null and (r.target_role is null or r.target_role = v_role)))
      and (r.days is null or extract(dow from v_local)::smallint = any (r.days))
      and (r.start_date is null or v_local::date >= r.start_date)
      and (r.end_date is null or v_local::date <= r.end_date)
      and (
        r.start_time is null
        or (r.start_time <= r.end_time and v_local::time >= r.start_time and v_local::time < r.end_time)
        or (r.start_time > r.end_time and (v_local::time >= r.start_time or v_local::time < r.end_time))
      )
  );
end;
$$;

alter table family_planner.member_rules enable row level security;
create policy "members can view rules" on family_planner.member_rules
  for select to authenticated using (family_planner.is_family_member(family_id));
create policy "parents add rules" on family_planner.member_rules
  for insert to authenticated with check (family_planner.is_family_parent(family_id));
create policy "parents change rules" on family_planner.member_rules
  for update to authenticated
  using (family_planner.is_family_parent(family_id)) with check (family_planner.is_family_parent(family_id));
create policy "parents remove rules" on family_planner.member_rules
  for delete to authenticated using (family_planner.is_family_parent(family_id));

-- ===========================================================================
-- 3. Activity slots: a calendar slot where everyone suggests what to do
-- ===========================================================================
alter table family_planner.events
  add column kind text not null default 'event' check (kind in ('event', 'slot')),
  add column requests_close_at timestamptz,
  add column chosen_request_id uuid;

-- Re-create write policies on shared tables so rules are enforced.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('events', 'events'), ('tasks', 'tasks'), ('shopping_lists', 'shopping'),
    ('shopping_items', 'shopping'), ('meals', 'meals')) as v(tbl, area)
  loop
    execute format('drop policy "members can insert" on family_planner.%I', t.tbl);
    execute format('drop policy "members can update" on family_planner.%I', t.tbl);
    execute format('drop policy "members can delete" on family_planner.%I', t.tbl);
    if t.tbl = 'events' then
      -- Activity slots (kind = 'slot') are parents-only.
      execute $p$create policy "members can insert" on family_planner.events for insert to authenticated
        with check (family_planner.can_write(family_id, 'events') and (kind = 'event' or family_planner.is_family_parent(family_id)))$p$;
      execute $p$create policy "members can update" on family_planner.events for update to authenticated
        using (family_planner.can_write(family_id, 'events') and (kind = 'event' or family_planner.is_family_parent(family_id)))
        with check (family_planner.can_write(family_id, 'events') and (kind = 'event' or family_planner.is_family_parent(family_id)))$p$;
      execute $p$create policy "members can delete" on family_planner.events for delete to authenticated
        using (family_planner.can_write(family_id, 'events') and (kind = 'event' or family_planner.is_family_parent(family_id)))$p$;
    else
      execute format('create policy "members can insert" on family_planner.%I for insert to authenticated with check (family_planner.can_write(family_id, %L))', t.tbl, t.area);
      execute format('create policy "members can update" on family_planner.%I for update to authenticated using (family_planner.can_write(family_id, %L)) with check (family_planner.can_write(family_id, %L))', t.tbl, t.area, t.area);
      execute format('create policy "members can delete" on family_planner.%I for delete to authenticated using (family_planner.can_write(family_id, %L))', t.tbl, t.area);
    end if;
  end loop;
end;
$$;

create table family_planner.activity_requests (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references family_planner.families (id) on delete cascade,
  event_id     uuid not null references family_planner.events (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  notes        text check (notes is null or char_length(notes) <= 1000),
  requested_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);
create index activity_requests_event_idx        on family_planner.activity_requests (event_id);
create index activity_requests_family_idx       on family_planner.activity_requests (family_id);
create index activity_requests_requested_by_idx on family_planner.activity_requests (requested_by);

alter table family_planner.events
  add constraint events_chosen_request_fk foreign key (chosen_request_id)
  references family_planner.activity_requests (id) on delete set null;
create index events_chosen_request_idx on family_planner.events (chosen_request_id);

create table family_planner.activity_votes (
  request_id uuid not null references family_planner.activity_requests (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  family_id  uuid not null references family_planner.families (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
create index activity_votes_user_idx   on family_planner.activity_votes (user_id);
create index activity_votes_family_idx on family_planner.activity_votes (family_id);

-- Requests must point at an open slot in the same family.
create or replace function family_planner.check_activity_request()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_event family_planner.events;
begin
  select * into v_event from family_planner.events e where e.id = new.event_id;
  if v_event.id is null or v_event.family_id <> new.family_id or v_event.kind <> 'slot' then
    raise exception 'That is not an activity slot in your family';
  end if;
  if tg_op = 'INSERT' and not family_planner.is_family_parent(new.family_id) and (
       v_event.chosen_request_id is not null
       or (v_event.requests_close_at is not null and v_event.requests_close_at < now())
     ) then
    raise exception 'Requests for this slot are closed';
  end if;
  if tg_op = 'UPDATE' and (new.event_id <> old.event_id or new.requested_by <> old.requested_by) then
    raise exception 'Cannot move a request';
  end if;
  return new;
end;
$$;
create trigger activity_requests_check before insert or update on family_planner.activity_requests
  for each row execute function family_planner.check_activity_request();

create or replace function family_planner.check_activity_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from family_planner.activity_requests r where r.id = new.request_id and r.family_id = new.family_id
  ) then
    raise exception 'Invalid request';
  end if;
  return new;
end;
$$;
create trigger activity_votes_check before insert on family_planner.activity_votes
  for each row execute function family_planner.check_activity_vote();

-- The chosen request must belong to the slot.
create or replace function family_planner.check_chosen_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.chosen_request_id is not null and not exists (
    select 1 from family_planner.activity_requests r where r.id = new.chosen_request_id and r.event_id = new.id
  ) then
    raise exception 'That request does not belong to this slot';
  end if;
  return new;
end;
$$;
create trigger events_check_chosen before insert or update of chosen_request_id on family_planner.events
  for each row execute function family_planner.check_chosen_request();

alter table family_planner.activity_requests enable row level security;
alter table family_planner.activity_votes    enable row level security;

create policy "members can view requests" on family_planner.activity_requests
  for select to authenticated using (family_planner.is_family_member(family_id));
create policy "members can request" on family_planner.activity_requests
  for insert to authenticated
  with check (requested_by = (select auth.uid()) and family_planner.can_write(family_id, 'requests'));
create policy "members edit own requests" on family_planner.activity_requests
  for update to authenticated
  using (requested_by = (select auth.uid()) and family_planner.can_write(family_id, 'requests'))
  with check (requested_by = (select auth.uid()) and family_planner.can_write(family_id, 'requests'));
create policy "own requests or parents can delete" on family_planner.activity_requests
  for delete to authenticated
  using ((requested_by = (select auth.uid()) and family_planner.can_write(family_id, 'requests'))
         or family_planner.is_family_parent(family_id));

create policy "members can view votes" on family_planner.activity_votes
  for select to authenticated using (family_planner.is_family_member(family_id));
create policy "members can vote" on family_planner.activity_votes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and family_planner.can_write(family_id, 'requests'));
create policy "members remove own vote" on family_planner.activity_votes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ===========================================================================
-- 4. Invites by email (in addition to the family invite code)
-- ===========================================================================
create table family_planner.invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references family_planner.families (id) on delete cascade,
  email       text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and char_length(email) <= 254),
  role        family_planner.member_role not null default 'other',
  invited_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index invites_pending_unique on family_planner.invites (family_id, lower(email)) where accepted_at is null;
create index invites_email_idx      on family_planner.invites (lower(email));
create index invites_invited_by_idx on family_planner.invites (invited_by);

alter table family_planner.invites enable row level security;
create policy "parents and invitee can view invites" on family_planner.invites
  for select to authenticated
  using (family_planner.is_family_parent(family_id) or lower(email) = lower((select auth.jwt()) ->> 'email'));
create policy "parents can invite" on family_planner.invites
  for insert to authenticated
  with check (family_planner.is_family_parent(family_id) and invited_by = (select auth.uid()) and accepted_at is null);
create policy "parents revoke, invitee declines" on family_planner.invites
  for delete to authenticated
  using (family_planner.is_family_parent(family_id) or lower(email) = lower((select auth.jwt()) ->> 'email'));

-- Pending invites for the signed-in user (with the family name, which they can't read yet).
create or replace function family_planner.my_invites()
returns table (id uuid, family_id uuid, family_name text, role family_planner.member_role, invited_by_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.family_id, f.name, i.role,
         (select m.display_name from family_planner.family_members m where m.family_id = i.family_id and m.user_id = i.invited_by),
         i.created_at
  from family_planner.invites i
  join family_planner.families f on f.id = i.family_id
  where i.accepted_at is null
    and lower(i.email) = lower((select u.email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null))
  order by i.created_at desc;
$$;

create or replace function family_planner.accept_invite(p_invite_id uuid, p_display_name text)
returns family_planner.families
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite family_planner.invites;
  v_family family_planner.families;
begin
  select u.email into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Confirm your email address first';
  end if;
  select * into v_invite from family_planner.invites i
   where i.id = p_invite_id and i.accepted_at is null and lower(i.email) = lower(v_email);
  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;
  insert into family_planner.family_members (family_id, user_id, display_name, role)
  values (v_invite.family_id, v_uid, trim(p_display_name), v_invite.role)
  on conflict (family_id, user_id) do nothing;
  update family_planner.invites set accepted_at = now() where id = v_invite.id;
  select * into v_family from family_planner.families where id = v_invite.family_id;
  return v_family;
end;
$$;

-- ===========================================================================
-- 5. Inbox (notifications)
-- ===========================================================================
create table family_planner.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  family_id  uuid references family_planner.families (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx   on family_planner.notifications (user_id, created_at desc);
create index notifications_family_idx on family_planner.notifications (family_id);

alter table family_planner.notifications enable row level security;
create policy "read own notifications" on family_planner.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "mark own notifications read" on family_planner.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own notifications" on family_planner.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Internal helpers used by triggers (not callable by app users).
create or replace function family_planner.notify(
  p_user uuid, p_family uuid, p_kind text, p_title text, p_body text, p_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into family_planner.notifications (user_id, family_id, kind, title, body, url)
  values (p_user, p_family, p_kind, left(p_title, 200), left(p_body, 500), p_url);
$$;

create or replace function family_planner.notify_family(
  p_family uuid, p_except uuid, p_parents_only boolean, p_kind text, p_title text, p_body text, p_url text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into family_planner.notifications (user_id, family_id, kind, title, body, url)
  select m.user_id, p_family, p_kind, left(p_title, 200), left(p_body, 500), p_url
  from family_planner.family_members m
  where m.family_id = p_family
    and m.user_id is distinct from p_except
    and (not p_parents_only or m.role = 'parent');
$$;

create or replace function family_planner.member_name(p_family uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.display_name from family_planner.family_members m where m.family_id = p_family and m.user_id = p_user),
    'Someone');
$$;

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

  if tg_op = 'UPDATE' and new.chosen_request_id is not null
     and new.chosen_request_id is distinct from old.chosen_request_id then
    select r.title into v_choice from family_planner.activity_requests r where r.id = new.chosen_request_id;
    perform family_planner.notify_family(new.family_id, v_actor, false, 'slot_decided',
      'Decided: ' || v_choice, 'Plan for "' || new.title || '"', '/calendar/');
  end if;
  return new;
end;
$$;
create trigger events_notify after insert or update on family_planner.events
  for each row execute function family_planner.on_event_change();

create or replace function family_planner.on_task_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and new.assigned_to is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform family_planner.notify(new.assigned_to, new.family_id, 'task',
      'New task for you: ' || new.title, 'From ' || family_planner.member_name(new.family_id, auth.uid()), '/tasks/');
  end if;
  return new;
end;
$$;
create trigger tasks_notify after insert or update of assigned_to on family_planner.tasks
  for each row execute function family_planner.on_task_change();

create or replace function family_planner.on_activity_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot text;
begin
  select e.title into v_slot from family_planner.events e where e.id = new.event_id;
  perform family_planner.notify_family(new.family_id, new.requested_by, true, 'request',
    family_planner.member_name(new.family_id, new.requested_by) || ' requested: ' || new.title,
    'For "' || v_slot || '"', '/calendar/');
  return new;
end;
$$;
create trigger activity_requests_notify after insert on family_planner.activity_requests
  for each row execute function family_planner.on_activity_request();

create or replace function family_planner.on_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_family text;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(new.email) limit 1;
  if v_user is not null then
    select f.name into v_family from family_planner.families f where f.id = new.family_id;
    perform family_planner.notify(v_user, null, 'invite',
      'You''re invited to join ' || v_family, 'Open your inbox to accept.', '/inbox/');
  end if;
  return new;
end;
$$;
create trigger invites_notify after insert on family_planner.invites
  for each row execute function family_planner.on_invite();

create or replace function family_planner.on_member_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform family_planner.notify_family(new.family_id, new.user_id, true, 'member',
    new.display_name || ' joined the family', 'Check their role on the Family page.', '/family/');
  return new;
end;
$$;
create trigger family_members_notify after insert on family_planner.family_members
  for each row execute function family_planner.on_member_join();

-- ===========================================================================
-- 6. Push notifications (Web Push via the `send-push` edge function)
-- ===========================================================================
create extension if not exists pg_net with schema extensions;

create table family_planner.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) <= 200),
  auth       text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on family_planner.push_subscriptions (user_id);

alter table family_planner.push_subscriptions enable row level security;
create policy "see own devices" on family_planner.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "remove own devices" on family_planner.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function family_planner.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from family_planner.push_subscriptions where endpoint = p_endpoint;
  insert into family_planner.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300));
end;
$$;

-- Secret shared between this database and the edge function (never leaves the server).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'family_planner_push_webhook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'family_planner_push_webhook_secret', 'Authenticates DB -> send-push edge function calls');
  end if;
end;
$$;

-- VAPID keys are generated by the edge function on first use and kept in Vault.
create or replace function family_planner.push_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'webhook_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'family_planner_push_webhook_secret'),
    'vapid_public',   (select decrypted_secret from vault.decrypted_secrets where name = 'family_planner_vapid_public'),
    'vapid_private',  (select decrypted_secret from vault.decrypted_secrets where name = 'family_planner_vapid_private'));
$$;

create or replace function family_planner.set_vapid_keys(p_public text, p_private text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'family_planner_vapid_public') then
    return; -- never overwrite: existing phone subscriptions depend on these keys
  end if;
  perform vault.create_secret(p_public, 'family_planner_vapid_public', 'Web Push public key');
  perform vault.create_secret(p_private, 'family_planner_vapid_private', 'Web Push private key');
end;
$$;

create or replace function family_planner.vapid_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'family_planner_vapid_public';
$$;

-- When a notification is created, ask the edge function to push it to the person's devices.
create or replace function family_planner.push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if not exists (select 1 from family_planner.push_subscriptions s where s.user_id = new.user_id) then
    return new;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'family_planner_push_webhook_secret';
  perform net.http_post(
    url := 'https://pdlkkfedovssaaecemkp.supabase.co/functions/v1/send-push',
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
  );
  return new;
exception when others then
  return new; -- a push failure must never block saving the notification
end;
$$;
create trigger notifications_push after insert on family_planner.notifications
  for each row execute function family_planner.push_notification();

-- ===========================================================================
-- 7. Checkers links on shopping items
-- ===========================================================================
alter table family_planner.shopping_items
  add column checkers_url text
  check (checkers_url is null or (checkers_url ~ '^https://(www\.|shop\.)?checkers\.co\.za/' and char_length(checkers_url) <= 500));

-- ===========================================================================
-- 8. Privileges
-- ===========================================================================
grant select, insert, update, delete on family_planner.member_rules to authenticated;
grant select, insert, delete on family_planner.activity_requests to authenticated;
grant update (title, notes) on family_planner.activity_requests to authenticated;
grant select, insert, delete on family_planner.activity_votes to authenticated;
grant select, insert, delete on family_planner.invites to authenticated;
grant select, delete on family_planner.notifications to authenticated;
grant update (read_at) on family_planner.notifications to authenticated;
grant select, delete on family_planner.push_subscriptions to authenticated;
grant all on family_planner.member_rules, family_planner.activity_requests, family_planner.activity_votes,
  family_planner.invites, family_planner.notifications, family_planner.push_subscriptions to service_role;

revoke execute on all functions in schema family_planner from public, anon, authenticated;
grant execute on function
  family_planner.create_family(text, text),
  family_planner.join_family(text, text),
  family_planner.regenerate_invite_code(uuid),
  family_planner.is_family_member(uuid),
  family_planner.is_family_parent(uuid),
  family_planner.can_write(uuid, family_planner.rule_area),
  family_planner.my_invites(),
  family_planner.accept_invite(uuid, text),
  family_planner.save_push_subscription(text, text, text, text),
  family_planner.vapid_public_key()
to authenticated;
grant execute on all functions in schema family_planner to service_role;

alter publication supabase_realtime add table
  family_planner.notifications,
  family_planner.activity_requests,
  family_planner.activity_votes,
  family_planner.member_rules;
