"use client";

// All writes to the database. Row-level security in Postgres is what actually
// stops anyone touching another family's data; these checks give nicer errors.

import type { FamilyContextValue } from "@/components/family-provider";
import { getSupabase } from "@/lib/supabase/client";
import { FieldError, check, isoDate, requiredStr, str, uuid } from "@/lib/form";
import { isValidTimeZone, zonedLocalToUtcIso } from "@/lib/dates";
import type { MealType } from "@/lib/supabase/types";

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
  if (ctx.me.role !== "owner") throw new FieldError("Only the family owner can do this");
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

export async function addEvent(ctx: FamilyContextValue, form: FormData) {
  const tz = ctx.family.timezone;
  const title = requiredStr(form, "title", "Title");
  const date = isoDate(form, "date");
  if (!date) throw new FieldError("Date is required");
  const startTime = str(form, "start_time", 5);
  const endTime = str(form, "end_time", 5);
  if ((startTime && !TIME_RE.test(startTime)) || (endTime && !TIME_RE.test(endTime))) throw new FieldError("Invalid time");
  const allDay = form.get("all_day") === "on" || !startTime;

  const startsAt = zonedLocalToUtcIso(allDay ? date : `${date}T${startTime}`, tz);
  const endsAt = !allDay && endTime ? zonedLocalToUtcIso(`${date}T${endTime}`, tz) : null;
  if (endsAt && endsAt < startsAt) throw new FieldError("End time must be after start time");

  check(
    (
      await ctx.supabase.from("events").insert({
        family_id: ctx.family.id,
        title,
        location: str(form, "location", 200),
        description: str(form, "description", 2000),
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: allDay,
        assigned_to: assignee(form, ctx),
      })
    ).error,
  );
}

export async function deleteEvent(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("events").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
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
  check(
    (
      await ctx.supabase.from("shopping_items").insert({
        family_id: ctx.family.id,
        list_id: listId,
        name: requiredStr(form, "name", "Item"),
        quantity: str(form, "quantity", 50),
      })
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
}

export async function deleteMeal(ctx: FamilyContextValue, id: string) {
  check((await ctx.supabase.from("meals").delete().eq("id", id).eq("family_id", ctx.family.id)).error);
}
