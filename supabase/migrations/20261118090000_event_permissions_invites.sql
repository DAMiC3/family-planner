-- Family Planner: per-person event permissions (allowed / needs approval / blocked),
-- owner-only editing for children and others, and event invites (co-owners or view-only).

-- ===========================================================================
-- 1. Columns
-- ===========================================================================
alter table family_planner.family_members
  add column event_permission text not null default 'allowed'
  check (event_permission in ('allowed', 'approval', 'blocked'));

alter table family_planner.events
  add column status text not null default 'approved' check (status in ('approved', 'pending', 'declined')),
  add column invitees_can_edit boolean not null default true;
create index events_status_idx on family_planner.events (family_id, status);

-- Only parents can change someone's event permission (extends the existing role guard).
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
  if (new.role is distinct from old.role or new.event_permission is distinct from old.event_permission)
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

grant update (event_permission) on family_planner.family_members to authenticated;

-- ===========================================================================
-- 2. Event invites
-- ===========================================================================
create table family_planner.event_invites (
  event_id     uuid not null references family_planner.events (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  family_id    uuid not null references family_planner.families (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  invited_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (event_id, user_id)
);
create index event_invites_user_idx       on family_planner.event_invites (user_id);
create index event_invites_family_idx     on family_planner.event_invites (family_id);
create index event_invites_invited_by_idx on family_planner.event_invites (invited_by);

-- Am I invited to this event (and haven't declined)?
create or replace function family_planner.is_event_invitee(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from family_planner.event_invites i
    where i.event_id = p_event_id and i.user_id = (select auth.uid()) and i.status <> 'declined'
  );
$$;

-- May I change this event? Parents: anything. Others: events they created, or joined as an
-- invitee when the owner allows invitees to edit. Activity slots: parents only.
create or replace function family_planner.can_edit_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from family_planner.events e
    where e.id = p_event_id
      and (
        family_planner.is_family_parent(e.family_id)
        or (e.kind = 'event' and family_planner.is_family_member(e.family_id) and (
              e.created_by = (select auth.uid())
              or (e.invitees_can_edit and exists (
                    select 1 from family_planner.event_invites i
                    where i.event_id = e.id and i.user_id = (select auth.uid()) and i.status = 'accepted'))
           ))
      )
  );
$$;

-- ===========================================================================
-- 3. Event rules: approval status, who may change what
-- ===========================================================================
create or replace function family_planner.guard_event_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_parent boolean;
  v_perm text;
begin
  if v_uid is null then
    return new;
  end if;
  v_parent := family_planner.is_family_parent(new.family_id);
  select m.event_permission into v_perm from family_planner.family_members m
   where m.family_id = new.family_id and m.user_id = v_uid;

  if tg_op = 'INSERT' then
    if v_parent then
      new.status := 'approved';
    elsif v_perm = 'blocked' then
      raise exception 'A parent has turned off adding events for you';
    else
      new.status := case when v_perm = 'approval' then 'pending' else 'approved' end;
    end if;
    return new;
  end if;

  if new.created_by is distinct from old.created_by or new.family_id <> old.family_id then
    raise exception 'The owner of an event cannot be changed';
  end if;
  if not v_parent then
    if new.status is distinct from old.status then
      raise exception 'Only parents can approve or decline events';
    end if;
    if new.invitees_can_edit is distinct from old.invitees_can_edit and old.created_by <> v_uid then
      raise exception 'Only the event owner can change who may edit it';
    end if;
    -- Someone who needs approval changed the event: it needs approving again.
    if v_perm = 'approval' and old.status = 'approved' and (
         new.title, new.starts_at, new.ends_at, new.all_day, new.location, new.lat, new.lng, new.description, new.assigned_to
       ) is distinct from (
         old.title, old.starts_at, old.ends_at, old.all_day, old.location, old.lat, old.lng, old.description, old.assigned_to
       ) then
      new.status := 'pending';
    end if;
  end if;
  return new;
end;
$$;
create trigger events_guard_write before insert or update on family_planner.events
  for each row execute function family_planner.guard_event_write();

drop policy "members can view" on family_planner.events;
drop policy "members can insert" on family_planner.events;
drop policy "members can update" on family_planner.events;
drop policy "members can delete" on family_planner.events;

create policy "members can view" on family_planner.events for select to authenticated
  using (
    family_planner.is_family_member(family_id)
    and (status = 'approved' or created_by = (select auth.uid())
         or family_planner.is_family_parent(family_id) or family_planner.is_event_invitee(id))
  );
create policy "members can insert" on family_planner.events for insert to authenticated
  with check (
    family_planner.can_write(family_id, 'events')
    and created_by = (select auth.uid())
    and (kind = 'event' or family_planner.is_family_parent(family_id))
  );
create policy "owners, co-owners and parents can update" on family_planner.events for update to authenticated
  using (family_planner.can_write(family_id, 'events') and family_planner.can_edit_event(id))
  with check (family_planner.can_write(family_id, 'events') and (kind = 'event' or family_planner.is_family_parent(family_id)));
create policy "owners and parents can delete" on family_planner.events for delete to authenticated
  using (
    family_planner.can_write(family_id, 'events')
    and (family_planner.is_family_parent(family_id) or (kind = 'event' and created_by = (select auth.uid())))
  );

-- Invites: validate, timestamp responses.
create or replace function family_planner.guard_event_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event family_planner.events;
begin
  select * into v_event from family_planner.events e where e.id = new.event_id;
  if tg_op = 'INSERT' then
    if v_event.id is null or v_event.family_id <> new.family_id then
      raise exception 'Event not found';
    end if;
    if not exists (select 1 from family_planner.family_members m where m.family_id = new.family_id and m.user_id = new.user_id) then
      raise exception 'You can only invite people in your family';
    end if;
    if new.user_id = v_event.created_by then
      raise exception 'The owner is already part of this event';
    end if;
    new.status := 'pending';
    new.invited_by := coalesce(auth.uid(), new.invited_by);
    new.responded_at := null;
    return new;
  end if;
  if new.event_id <> old.event_id or new.user_id <> old.user_id or new.family_id <> old.family_id then
    raise exception 'Invites cannot be moved';
  end if;
  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;
create trigger event_invites_guard before insert or update on family_planner.event_invites
  for each row execute function family_planner.guard_event_invite();

alter table family_planner.event_invites enable row level security;
create policy "members can view event invites" on family_planner.event_invites for select to authenticated
  using (family_planner.is_family_member(family_id));
create policy "owners, co-owners and parents invite" on family_planner.event_invites for insert to authenticated
  with check (family_planner.can_write(family_id, 'events') and family_planner.can_edit_event(event_id));
create policy "invitee answers" on family_planner.event_invites for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "invitee leaves, owners remove" on family_planner.event_invites for delete to authenticated
  using (user_id = (select auth.uid()) or family_planner.can_edit_event(event_id));

grant select, insert, delete on family_planner.event_invites to authenticated;
grant update (status) on family_planner.event_invites to authenticated;
grant all on family_planner.event_invites to service_role;

-- ===========================================================================
-- 4. Notifications
-- ===========================================================================
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
  v_live boolean := new.status = 'approved';
  v_became_live boolean := new.status = 'approved' and (tg_op = 'INSERT' or old.status <> 'approved');
begin
  -- Approval flow
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status <> 'pending') then
    perform family_planner.notify_family(new.family_id, v_actor, true, 'approval',
      v_who || ' wants to add: ' || new.title, 'Approve or decline it in the calendar.', '/calendar/');
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved', 'declined')
     and new.created_by is distinct from v_actor then
    perform family_planner.notify(new.created_by, new.family_id, 'approval',
      case when new.status = 'approved' then 'Approved: ' else 'Declined: ' end || new.title,
      'By ' || v_who, '/calendar/');
  end if;

  if tg_op = 'INSERT' and new.kind = 'slot' then
    perform family_planner.notify_family(new.family_id, v_actor, false, 'slot',
      'New activity slot: ' || new.title, v_who || ' wants ideas — add what you''d like to do.', '/calendar/');
  elsif v_live and new.assigned_to is not null and new.assigned_to is distinct from v_actor
        and (v_became_live or new.assigned_to is distinct from old.assigned_to) then
    perform family_planner.notify(new.assigned_to, new.family_id, 'event',
      'New on your program: ' || new.title, 'Added by ' || v_who, '/program/');
  end if;

  if v_live and new.driver_id is not null and new.driver_id is distinct from v_actor
     and (v_became_live or new.driver_id is distinct from old.driver_id) then
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

create or replace function family_planner.on_event_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_owner uuid;
begin
  select e.title, e.created_by into v_title, v_owner from family_planner.events e where e.id = new.event_id;
  if tg_op = 'INSERT' then
    perform family_planner.notify(new.user_id, new.family_id, 'event_invite',
      family_planner.member_name(new.family_id, new.invited_by) || ' invited you to: ' || v_title,
      'Accept or decline on My program.', '/program/');
  elsif new.status is distinct from old.status and new.status in ('accepted', 'declined') then
    perform family_planner.notify(coalesce(new.invited_by, v_owner), new.family_id, 'event_invite',
      family_planner.member_name(new.family_id, new.user_id) || ' ' || new.status || ': ' || v_title,
      null, '/calendar/');
  end if;
  return new;
end;
$$;
create trigger event_invites_notify after insert or update on family_planner.event_invites
  for each row execute function family_planner.on_event_invite();

-- History + live updates for invites
create trigger event_invites_log_change after insert or update or delete on family_planner.event_invites
  for each row execute function family_planner.log_change();
alter publication supabase_realtime add table family_planner.event_invites;

revoke execute on function family_planner.guard_event_write(), family_planner.guard_event_invite(),
  family_planner.on_event_invite() from public, anon, authenticated;
grant execute on function family_planner.is_event_invitee(uuid), family_planner.can_edit_event(uuid) to authenticated;
grant execute on function family_planner.is_event_invitee(uuid), family_planner.can_edit_event(uuid) to service_role;
