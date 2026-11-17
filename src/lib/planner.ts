"use client";

// All writes to the database. Row-level security in Postgres is what actually
// stops anyone touching another family's data; these checks give nicer errors.

import type { FamilyContextValue } from "@/components/family-provider";
import { getSupabase } from "@/lib/supabase/client";
import { FieldError, check, isoDate, requiredStr, str, uuid } from "@/lib/form";
import { isValidTimeZone, zonedLocalToUtcIso } from "@/lib/dates";
import type { Place } from "@/lib/geo";
import { loadMyPlaces } from "@/lib/places";
import { estimateLeaveBy } from "@/lib/route";
import type {
  CalendarEvent,
  EventInvite,
  EventPermission,
  MealType,
  MemberRole,
  RuleArea,
} from "@/lib/supabase/types";

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function assignee(form: FormData, ctx: FamilyContextValue) {
  const id = uuid(form, "assigned_to");
  if (id && !ctx.members.some((m) => m.user_id === id)) throw new FieldError("That person isn't in your family");
  return id;
}

// ---------------------------------------------------------------- family

export async function createFamily(form: FormData) {
  const supabase = getSupabase();
  const name = requiredStr(form, "name", "Family name", 80);
  const displayName = requiredStr(form, "display_name", "Your name", 50);
  const tz = str(form, "timezone", 64);
  const { data: family, error } = await supabase.rpc("create_family", { p_name: name, p_display_name: displayName });
  check(error);
  if (tz && isValidTimeZone(tz)) {
    await supabase.from("families").update({ name, timezone: tz }).eq("id", family!.id);
  }
}

export async function joinFamily(form: FormData) {
  const supabase = getSupabase();
  const code = requiredStr(form, "invite_code", "Invite code", 20);
  const displayName = requiredStr(form, "display_name", "Your name", 50);
  const { error } = await supabase.rpc("join_family", { p_invite_code: code, p_display_name: displayName });
  if (error) throw new FieldError(error.message.includes("invalid invite") ? "That invite code didn't work" : error.message);
}

export async function updateMyProfile(ctx: FamilyContextValue, form: FormData) {
  const displayName = requiredStr(form, "display_name", "Name", 50);
  const color = str(form, "color", 7) ?? "#6366f1";
  if (!COLOR_RE.test(color)) throw new FieldError("Pick a valid colour");
  check(
    (
      await ctx.supabase
        .from("family_members")
        .update({ display_name: displayName, color })
        .eq("family_id", ctx.family.id)
        .eq("user_id", ctx.userId)
    ).error,
  );
  await ctx.reloadFamily();
}

export async function updateFamily(ctx: FamilyContextValue, form: FormData) {
  if (!ctx.isParent) throw new FieldError("Only parents can do this");
  const name = requiredStr(form, "name", "Family name", 80);
  const tz = requiredStr(form, "timezone", "Timezone", 64);
  if (!isValidTimeZone(tz)) throw new FieldError("Unknown timezone");
  check((await ctx.supabase.from("families").update({ name, timezone: tz }).eq("id", ctx.family.id)).error);
  await ctx.reloadFamily();
}

export async function regenerateInviteCode(ctx: FamilyContextValue) {
  check((await ctx.supabase.rpc("regenerate_invite_code", { p_family_id: ctx.family.id })).error);
  await ctx.reloadFamily();
}

export async function leaveFamily(ctx: FamilyContextValue) {
  check(
    (await ctx.supabase.from("family_members").delete().eq("family_id", ctx.family.id).eq("user_id", ctx.userId)).error,
  );
}

// ---------------------------------------------------------------- events

/** Let every open screen know the calendar changed (the + sheet lives outside the pages). */
export function announceChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("planner:changed"));
}

/** Read the shared fields of the event sheet (add + edit). */
function eventFields(ctx: FamilyContextValue, form: FormData, place: Place | null) {
  const tz = ctx.family.timezone;
  const title = requiredStr(form, "title", "What");
  if (!place) throw new FieldError("Add where it is");
  const date = isoDate(form, "date");
  if (!date) throw new FieldError("Pick a date");
  const startTime = str(form, "start_time", 5);
  const endTime = str(form, "end_time", 5);
  if ((startTime && !TIME_RE.test(startTime)) || (endTime && !TIME_RE.test(endTime))) throw new FieldError("Invalid time");
  const allDay = form.get("all_day") === "on" || !startTime;
  const startsAt = zonedLocalToUtcIso(allDay ? date : `${date}T${startTime}`, tz);
  const endsAt = !allDay && endTime ? zonedLocalToUtcIso(`${date}T${endTime}`, tz) : null;
  if (endsAt && endsAt < startsAt) throw new FieldError("End time must be after start time");
  const arriveTime = str(form, "arrive_time", 5);
  const pickupTime = str(form, "pickup_time", 5);
  if ((arriveTime && !TIME_RE.test(arriveTime)) || (pickupTime && !TIME_RE.test(pickupTime))) throw new FieldError("Invalid time");
  const arriveBy = arriveTime ? zonedLocalToUtcIso(`${date}T${arriveTime}`, tz) : null;
  const pickupAt = pickupTime ? zonedLocalToUtcIso(`${date}T${pickupTime}`, tz) : null;
  if (arriveBy && pickupAt && pickupAt < arriveBy) throw new FieldError("Pick-up must be after the drop-off time");
  return {
    arrive_by: arriveBy,
    pickup_at: pickupAt,
    title,
    location: place.name === place.address ? place.address.slice(0, 200) : `${place.name} — ${place.address}`.slice(0, 200),
    lat: place.lat,
    lng: place.lng,
    description: str(form, "description", 2000),
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    assigned_to: assignee(form, ctx),
  };
}

function driverField(ctx: FamilyContextValue, form: FormData) {
  const driverId = uuid(form, "driver_id");
  if (driverId && !ctx.members.some((m) => m.user_id === driverId)) throw new FieldError("That driver isn't in your family");
  return driverId;
}

/** Leave time for the default-car deadline: be-there-by minus the drive from my Home. */
async function leaveByFor(fields: { arrive_by: string | null; starts_at: string; lat: number; lng: number }) {
  try {
    const home = (await loadMyPlaces()).find((p) => p.is_home) ?? null;
    return await estimateLeaveBy(home, { lat: fields.lat, lng: fields.lng }, fields.arrive_by ?? fields.starts_at);
  } catch {
    return null;
  }
}

function carField(ctx: FamilyContextValue, form: FormData) {
  const carId = uuid(form, "car_id");
  if (carId && !ctx.cars.some((c) => c.id === carId)) throw new FieldError("That car isn't in your family");
  return carId;
}

function inviteesField(ctx: FamilyContextValue, form: FormData, ownerId: string) {
  const ids = form.getAll("invitees").map(String);
  return [...new Set(ids)].filter((id) => id !== ownerId && ctx.members.some((m) => m.user_id === id));
}

/** Can I change this event? Mirrors family_planner.can_edit_event (the database decides). */
export function canEditEvent(ctx: FamilyContextValue, e: CalendarEvent, invites: EventInvite[]) {
  if (ctx.isParent) return true;
  if (e.kind !== "event") return false;
  if (e.created_by === ctx.userId) return true;
  return e.invitees_can_edit && invites.some((i) => i.event_id === e.id && i.user_id === ctx.userId && i.status === "accepted");
}

export function canDeleteEvent(ctx: FamilyContextValue, e: CalendarEvent) {
  return ctx.isParent || (e.kind === "event" && e.created_by === ctx.userId);
}

export async function addEvent(ctx: FamilyContextValue, form: FormData, place: Place | null) {
  const tz = ctx.family.timezone;
  const isSlot = form.get("kind") === "slot";
  if (isSlot && !ctx.isParent) throw new FieldError("Only parents can add activity slots");
  if (!ctx.isParent && ctx.me.event_permission === "blocked") throw new FieldError("A parent has turned off adding events for you");
  const fields = eventFields(ctx, form, place);
  const closeDate = isoDate(form, "close_date");
  const closeTime = str(form, "close_time", 5);
  if (closeTime && !TIME_RE.test(closeTime)) throw new FieldError("Invalid time");
  const closesAt = isSlot && closeDate ? zonedLocalToUtcIso(closeTime ? `${closeDate}T${closeTime}` : `${closeDate}T23:59`, tz) : null;

  const leaveBy = isSlot ? null : await leaveByFor(fields);
  const { data, error } = await ctx.supabase
    .from("events")
    .insert({
      family_id: ctx.family.id,
      kind: isSlot ? "slot" : "event",
      requests_close_at: closesAt,
      ...fields,
      leave_by: leaveBy,
      assigned_to: isSlot ? null : fields.assigned_to,
      driver_id: ctx.isParent ? driverField(ctx, form) : null,
      car_id: ctx.canAssignCars && !isSlot ? carField(ctx, form) : null,
      invitees_can_edit: form.get("invitees_can_edit") !== "false",
    })
    .select("id")
    .single();
  check(error);

  const invitees = isSlot ? [] : inviteesField(ctx, form, ctx.userId);
  if (invitees.length) {
    check(
      (await ctx.supabase.from("event_invites").insert(invitees.map((user_id) => ({ event_id: data!.id, user_id, family_id: ctx.family.id }))))
        .error,
    );
  }
  announceChange();
}

export async function updateEvent(
  ctx: FamilyContextValue,
  event: CalendarEvent,
  invites: EventInvite[],
  form: FormData,
  place: Place | null,
) {
  if (!canEditEvent(ctx, event, invites)) throw new FieldError("You can't change this event");
  const fields = eventFields(ctx, form, place);
  const patch: {
    [K in keyof ReturnType<typeof eventFields>]?: ReturnType<typeof eventFields>[K];
  } & { driver_id?: string | null; invitees_can_edit?: boolean; car_id?: string | null; leave_by?: string | null } = { ...fields };
  if (event.kind === "event") patch.leave_by = await leaveByFor(fields);
  if (ctx.canAssignCars && event.kind === "event") patch.car_id = carField(ctx, form);
  if (event.kind === "slot") patch.assigned_to = null;
  if (ctx.isParent) patch.driver_id = driverField(ctx, form);
  if (ctx.isParent || event.created_by === ctx.userId) patch.invitees_can_edit = form.get("invitees_can_edit") !== "false";
  check((await ctx.supabase.from("events").update(patch).eq("id", event.id).eq("family_id", ctx.family.id)).error);

  if (event.kind === "event") {
    const wanted = inviteesField(ctx, form, event.created_by);
    const current = invites.filter((i) => i.event_id === event.id).map((i) => i.user_id);
    const add = wanted.filter((id) => !current.includes(id));
    const remove = current.filter((id) => !wanted.includes(id));
    if (add.length) {
      check(
        (await ctx.supabase.from("event_invites").insert(add.map((user_id) => ({ event_id: event.id, user_id, family_id: ctx.family.id }))))
          .error,
      );
    }
    if (remove.length) {
      check((await ctx.supabase.from("event_invites").delete().eq("event_id", event.id).in("user_id", remove)).error);
    }
  }
  announceChange();
}

/** Parents approve or decline an event a child (or other) asked to add. */
export async function setEventStatus(ctx: FamilyContextValue, eventId: string, status: "approved" | "declined") {
  if (!ctx.isParent) throw new FieldError("Only parents can approve events");
  check((await ctx.supabase.from("events").update({ status }).eq("id", eventId).eq("family_id", ctx.family.id)).error);
  announceChange();
}

/** Accept or decline an invite to someone's event. */
export async function respondToInvite(ctx: FamilyContextValue, eventId: string, status: "accepted" | "declined") {
  check(
    (await ctx.supabase.from("event_invites").update({ status }).eq("event_id", eventId).eq("user_id", ctx.userId)).error,
  );
  announceChange();
}

/** Parents: can this person add events freely, with approval, or not at all? */
export async function setEventPermission(ctx: FamilyContextValue, userId: string, permission: EventPermission) {
  if (!ctx.isParent) throw new FieldError("Only parents can change this");
  check(
    (
      await ctx.supabase
        .from("family_members")
        .update({ event_permission: permission })
        .eq("family_id", ctx.family.id)
        .eq("user_id", userId)
    ).error,
  );
  await ctx.reloadFamily();
}

/** Choose the car for an event (parents, or someone a parent allowed). null = no car yet (pin floats). */
export async function setCar(ctx: FamilyContextValue, eventId: string, carId: string | null) {
  if (!ctx.canAssignCars) throw new FieldError("A parent has to give you permission to choose cars");
  check((await ctx.supabase.from("events").update({ car_id: carId }).eq("id", eventId).eq("family_id", ctx.family.id)).error);
  announceChange();
}

// ---------------------------------------------------------------- cars (parents)

const CAR_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function addCar(ctx: FamilyContextValue, form: FormData) {
  if (!ctx.isParent) throw new FieldError("Only parents can add cars");
  const name = requiredStr(form, "name", "Car name", 40);
  const color = str(form, "color", 7) ?? "#FF385C";
  if (!CAR_COLOR_RE.test(color)) throw new FieldError("Pick a colour");
  check(
    (
      await ctx.supabase
        .from("cars")
        .insert({ family_id: ctx.family.id, name, color, is_default: ctx.cars.length === 0 })
    ).error,
  );
  await ctx.reloadFamily();
}

export async function updateCar(ctx: FamilyContextValue, id: string, patch: { name?: string; color?: string }) {
  if (!ctx.isParent) throw new FieldError("Only parents can change cars");
  if (patch.name !== undefined && !patch.name.trim()) throw new FieldError("Car name is required");
  if (patch.color !== undefined && !CAR_COLOR_RE.test(patch.color)) throw new FieldError("Pick a colour");
  check((await ctx.supabase.from("cars").update(patch).eq("id", id).eq("family_id", ctx.family.id)).error);
  await ctx.reloadFamily();
}

export async function makeDefaultCar(ctx: FamilyContextValue, id: string) {
  if (!ctx.isParent) throw new FieldError("Only parents can change cars");
  check((await ctx.supabase.from("cars").update({ is_default: false }).eq("family_id", ctx.family.id).eq("is_default", true)).error);
  check((await ctx.supabase.from("cars").update({ is_default: true }).eq("id", id).eq("family_id", ctx.family.id)).error);
  await ctx.reloadFamily();
}

export async function deleteCar(ctx: FamilyContextValue, id: string) {
  if (!ctx.isParent) throw new FieldError("Only parents can remove cars");
  check((await ctx.supabase.from("cars").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
  await ctx.reloadFamily();
  announceChange();
}

export async function setAutoAssignHours(ctx: FamilyContextValue, hours: number) {
  if (!ctx.isParent) throw new FieldError("Only parents can change this");
  if (!Number.isInteger(hours) || hours < 0 || hours > 168) throw new FieldError("Choose between 0 and 168 hours");
  check((await ctx.supabase.from("families").update({ car_auto_assign_hours: hours }).eq("id", ctx.family.id)).error);
  await ctx.reloadFamily();
}

export async function setCanAssignCars(ctx: FamilyContextValue, userId: string, allowed: boolean) {
  if (!ctx.isParent) throw new FieldError("Only parents can change this");
  check(
    (
      await ctx.supabase
        .from("family_members")
        .update({ can_assign_cars: allowed })
        .eq("family_id", ctx.family.id)
        .eq("user_id", userId)
    ).error,
  );
  await ctx.reloadFamily();
}

/** Parents: pick who drives to an event (null = no driver). */
export async function setDriver(ctx: FamilyContextValue, eventId: string, driverId: string | null) {
  if (!ctx.isParent) throw new FieldError("Only parents can assign drivers");
  check(
    (await ctx.supabase.from("events").update({ driver_id: driverId }).eq("id", eventId).eq("family_id", ctx.family.id)).error,
  );
  announceChange();
}

export async function deleteEvent(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("events").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
  announceChange();
}

// ---------------------------------------------------------------- tasks

export async function addTask(ctx: FamilyContextValue, form: FormData) {
  const points = Number(form.get("points") ?? 0);
  check(
    (
      await ctx.supabase.from("tasks").insert({
        family_id: ctx.family.id,
        title: requiredStr(form, "title", "Task"),
        notes: str(form, "notes", 2000),
        due_date: isoDate(form, "due_date"),
        points: Number.isInteger(points) && points >= 0 && points <= 1000 ? points : 0,
        assigned_to: assignee(form, ctx),
      })
    ).error,
  );
}

export async function toggleTask(ctx: FamilyContextValue, id: string, done: boolean) {
  check(
    (
      await ctx.supabase
        .from("tasks")
        .update(
          done
            ? { completed_at: null, completed_by: null }
            : { completed_at: new Date().toISOString(), completed_by: ctx.userId },
        )
        .eq("id", id)
        .eq("family_id", ctx.family.id)
    ).error,
  );
}

export async function deleteTask(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("tasks").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
}

// ---------------------------------------------------------------- shopping

export async function addShoppingItem(ctx: FamilyContextValue, listId: string, form: FormData) {
  const name = requiredStr(form, "name", "Item");
  // Reuse the Checkers product link from the last time this item was on the list.
  const { data: previous } = await ctx.supabase
    .from("shopping_items")
    .select("checkers_url")
    .eq("family_id", ctx.family.id)
    .ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`))
    .not("checkers_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  check(
    (
      await ctx.supabase.from("shopping_items").insert({
        family_id: ctx.family.id,
        list_id: listId,
        name,
        quantity: str(form, "quantity", 50),
        checkers_url: previous?.[0]?.checkers_url ?? null,
      })
    ).error,
  );
}

const CHECKERS_RE = /^https:\/\/(www\.|shop\.)?checkers\.co\.za\/\S*$/;

/** Checkers search link for an item name. */
export function checkersSearchUrl(name: string) {
  return `https://www.checkers.co.za/search?q=${encodeURIComponent(name)}`;
}

/** Save (or clear, with an empty string) the exact Checkers product link for an item. */
export async function setCheckersLink(ctx: FamilyContextValue, id: string, url: string) {
  const trimmed = url.trim();
  if (trimmed && (!CHECKERS_RE.test(trimmed) || trimmed.length > 500)) {
    throw new FieldError("Paste a link that starts with https://www.checkers.co.za/");
  }
  check(
    (
      await ctx.supabase
        .from("shopping_items")
        .update({ checkers_url: trimmed || null })
        .eq("id", id)
        .eq("family_id", ctx.family.id)
    ).error,
  );
}

export async function toggleShoppingItem(ctx: FamilyContextValue, id: string, checked: boolean) {
  check(
    (await ctx.supabase.from("shopping_items").update({ checked: !checked }).eq("id", id).eq("family_id", ctx.family.id))
      .error,
  );
}

export async function deleteShoppingItem(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("shopping_items").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
}

export async function clearCheckedItems(ctx: FamilyContextValue, listId: string) {
  check(
    (
      await ctx.supabase
        .from("shopping_items")
        .delete()
        .eq("family_id", ctx.family.id)
        .eq("list_id", listId)
        .eq("checked", true)
    ).error,
  );
}

// ---------------------------------------------------------------- meals

export async function addMeal(ctx: FamilyContextValue, form: FormData) {
  const date = isoDate(form, "date");
  if (!date) throw new FieldError("Date is required");
  const mealType = String(form.get("meal_type") ?? "dinner") as MealType;
  if (!MEAL_TYPES.includes(mealType)) throw new FieldError("Invalid meal type");
  check(
    (
      await ctx.supabase.from("meals").insert({
        family_id: ctx.family.id,
        date,
        meal_type: mealType,
        title: requiredStr(form, "title", "Meal"),
        notes: str(form, "notes", 1000),
      })
    ).error,
  );
  announceChange();
}

export async function deleteMeal(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("meals").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
}

// ---------------------------------------------------------------- activity slots

export async function addRequest(ctx: FamilyContextValue, eventId: string, form: FormData) {
  check(
    (
      await ctx.supabase.from("activity_requests").insert({
        family_id: ctx.family.id,
        event_id: eventId,
        title: requiredStr(form, "title", "Idea"),
        notes: str(form, "notes", 1000),
      })
    ).error,
  );
}

export async function deleteRequest(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("activity_requests").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
}

export async function toggleVote(ctx: FamilyContextValue, requestId: string, voted: boolean) {
  const q = voted
    ? ctx.supabase.from("activity_votes").delete().eq("request_id", requestId).eq("user_id", ctx.userId)
    : ctx.supabase.from("activity_votes").insert({ request_id: requestId, family_id: ctx.family.id });
  check((await q).error);
}

export async function chooseRequest(ctx: FamilyContextValue, eventId: string, requestId: string | null) {
  if (!ctx.isParent) throw new FieldError("Only parents can decide");
  check(
    (await ctx.supabase.from("events").update({ chosen_request_id: requestId }).eq("id", eventId).eq("family_id", ctx.family.id))
      .error,
  );
}

// ---------------------------------------------------------------- rules (parents)

const TIME_OR_NULL = (v: string | null) => {
  if (v && !TIME_RE.test(v)) throw new FieldError("Invalid time");
  return v;
};

export async function addRule(ctx: FamilyContextValue, form: FormData) {
  if (!ctx.isParent) throw new FieldError("Only parents can add rules");
  const who = String(form.get("who") ?? "all");
  let target_user: string | null = null;
  let target_role: MemberRole | null = null;
  if (who === "role:child") target_role = "child";
  else if (who === "role:other") target_role = "other";
  else if (who.startsWith("user:")) {
    target_user = who.slice(5);
    const m = ctx.members.find((x) => x.user_id === target_user);
    if (!m) throw new FieldError("That person isn't in your family");
    if (m.role === "parent") throw new FieldError("Rules don't apply to parents");
  }
  const area = String(form.get("area") ?? "everything") as RuleArea;
  const days = form.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const start_time = TIME_OR_NULL(str(form, "start_time", 5));
  const end_time = TIME_OR_NULL(str(form, "end_time", 5));
  if ((start_time === null) !== (end_time === null)) throw new FieldError("Set both a start and an end time, or neither");
  const start_date = isoDate(form, "start_date");
  const end_date = isoDate(form, "end_date");
  if (start_date && end_date && end_date < start_date) throw new FieldError("End date is before start date");

  check(
    (
      await ctx.supabase.from("member_rules").insert({
        family_id: ctx.family.id,
        target_user,
        target_role,
        area,
        days: days.length && days.length < 7 ? days : null,
        start_time,
        end_time,
        start_date,
        end_date,
        note: str(form, "note", 200),
      })
    ).error,
  );
  await ctx.reloadFamily();
}

export async function deleteRule(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("member_rules").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
  await ctx.reloadFamily();
}

// ---------------------------------------------------------------- members, invites (parents)

export async function setMemberRole(ctx: FamilyContextValue, userId: string, role: MemberRole) {
  check(
    (await ctx.supabase.from("family_members").update({ role }).eq("family_id", ctx.family.id).eq("user_id", userId)).error,
  );
  await ctx.reloadFamily();
}

export async function removeMember(ctx: FamilyContextValue, userId: string) {
  check((await ctx.supabase.from("family_members").delete().eq("family_id", ctx.family.id).eq("user_id", userId)).error);
  await ctx.reloadFamily();
}

export async function inviteByEmail(ctx: FamilyContextValue, form: FormData) {
  const email = requiredStr(form, "email", "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FieldError("Enter a valid email address");
  const role = String(form.get("role") ?? "other") as MemberRole;
  if (!["parent", "child", "other"].includes(role)) throw new FieldError("Pick a role");
  const { error } = await ctx.supabase.from("invites").insert({ family_id: ctx.family.id, email, role });
  if (error?.code === "23505") throw new FieldError("That person already has a pending invite");
  check(error);
}

export async function revokeInvite(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("invites").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
}

export async function acceptInvite(inviteId: string, displayName: string) {
  const name = displayName.trim();
  if (!name || name.length > 50) throw new FieldError("Enter your name (max 50 characters)");
  check((await getSupabase().rpc("accept_invite", { p_invite_id: inviteId, p_display_name: name })).error);
}

export async function declineInvite(inviteId: string) {
  check((await getSupabase().from("invites").delete().eq("id", inviteId)).error);
}

// ---------------------------------------------------------------- inbox

export async function markRead(ids: string[]) {
  if (!ids.length) return;
  check((await getSupabase().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids)).error);
}

export async function deleteNotification(id: string) {
  check((await getSupabase().from("notifications").delete().eq("id", id)).error);
}
