-- Nicknames, parent-controlled "can edit own profile", and the "is this your real family?" answer.

alter table family_planner.family_members
  add column nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  add column can_edit_profile boolean not null default true,
  add column family_confirmed boolean;

-- Everyone already in a family has effectively confirmed it.
update family_planner.family_members set family_confirmed = true where family_confirmed is null;

grant update (nickname, can_edit_profile, family_confirmed) on family_planner.family_members to authenticated;

create or replace function family_planner.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_parent boolean;
begin
  if new.family_id <> old.family_id or new.user_id <> old.user_id then
    raise exception 'family_id and user_id cannot be changed';
  end if;
  if v_uid is null then
    return new;
  end if;
  v_parent := family_planner.is_family_parent(old.family_id);

  if not v_parent and (
       new.role is distinct from old.role
       or new.event_permission is distinct from old.event_permission
       or new.can_assign_cars is distinct from old.can_assign_cars
       or new.can_edit_profile is distinct from old.can_edit_profile
     ) then
    raise exception 'Only parents can change roles and permissions';
  end if;
  -- Personal info: parents can always change it; others only their own, and only if allowed.
  if not v_parent and (
       new.display_name is distinct from old.display_name
       or new.nickname is distinct from old.nickname
       or new.color is distinct from old.color
     ) and (old.user_id <> v_uid or not old.can_edit_profile) then
    raise exception 'A parent has locked your name, nickname and colour';
  end if;
  -- Only you can answer whether this is your real family.
  if new.family_confirmed is distinct from old.family_confirmed and old.user_id <> v_uid then
    raise exception 'Only that person can answer this';
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

-- The creator of a family has obviously confirmed it.
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
  insert into family_planner.family_members (family_id, user_id, display_name, role, family_confirmed)
  values (v_family.id, v_uid, trim(p_display_name), 'parent', true);
  insert into family_planner.shopping_lists (family_id, name, created_by) values (v_family.id, 'Groceries', v_uid);
  return v_family;
end;
$$;

-- Notifications use the nickname when there is one.
create or replace function family_planner.member_name(p_family uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(m.nickname, m.display_name) from family_planner.family_members m
      where m.family_id = p_family and m.user_id = p_user),
    'Someone');
$$;
