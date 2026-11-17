"use client";

// All writes to the database. Row-level security in Postgres is what actually
// stops anyone touching another family's data; these checks give nicer errors.

import type { FamilyContextValue } from "@/components/family-provider";
import { getSupabase } from "@/lib/supabase/client";
import { FieldError, check, isoDate, requiredStr, str, uuid } from "@/lib/form";
import { isValidTimeZone, zonedLocalToUtcIso } from "@/lib/dates";
import type { Place } from "@/lib/geo";
import type { MealType, MemberRole, RuleArea } from "@/lib/supabase/types";

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

export async function addEvent(ctx: FamilyContextValue, form: FormData, place: Place | null) {
  const tz = ctx.family.timezone;
  const isSlot = form.get("kind") === "slot";
  if (isSlot && !ctx.isParent) throw new FieldError("Only parents can add activity slots");
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
  const closeDate = isoDate(form, "close_date");
  const closeTime = str(form, "close_time", 5);
  if (closeTime && !TIME_RE.test(closeTime)) throw new FieldError("Invalid time");
  const closesAt = isSlot && closeDate ? zonedLocalToUtcIso(closeTime ? `${closeDate}T${closeTime}` : `${closeDate}T23:59`, tz) : null;

  const driverId = uuid(form, "driver_id");
  if (driverId && !ctx.isParent) throw new FieldError("Only parents can assign drivers");
  if (driverId && !ctx.members.some((m) => m.user_id === driverId)) throw new FieldError("That driver isn't in your family");

  check(
    (
      await ctx.supabase.from("events").insert({
        family_id: ctx.family.id,
        kind: isSlot ? "slot" : "event",
        requests_close_at: closesAt,
        title,
        location: place.name === place.address ? place.address.slice(0, 200) : `${place.name} — ${place.address}`.slice(0, 200),
        lat: place.lat,
        lng: place.lng,
        description: str(form, "description", 2000),
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: allDay,
        assigned_to: isSlot ? null : assignee(form, ctx),
        driver_id: driverId,
      })
    ).error,
  );
  announceChange();
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
