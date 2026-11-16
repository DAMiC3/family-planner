"use server";

import { refresh } from "next/cache";
import { requireFamily } from "@/lib/family";
import { FieldError, handle, isoDate, requiredStr, str, uuid, type ActionState } from "@/lib/form";
import { zonedLocalToUtcIso } from "@/lib/dates";
import type { MealType } from "@/lib/supabase/types";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Only allow assigning to people who are actually in the family. */
function assignee(form: FormData, memberIds: string[]) {
  const id = uuid(form, "assigned_to");
  if (id && !memberIds.includes(id)) throw new FieldError("That person isn't in your family");
  return id;
}

// ---------------------------------------------------------------- events

export async function addEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const { supabase, family, members } = await requireFamily();
    const title = requiredStr(form, "title", "Title");
    const allDay = form.get("all_day") === "on";
    const date = isoDate(form, "date");
    if (!date) throw new FieldError("Date is required");
    const startTime = str(form, "start_time", 5);
    const endTime = str(form, "end_time", 5);
    const timeRe = /^\d{2}:\d{2}$/;
    if ((startTime && !timeRe.test(startTime)) || (endTime && !timeRe.test(endTime))) throw new FieldError("Invalid time");

    const startsAt = zonedLocalToUtcIso(allDay || !startTime ? date : `${date}T${startTime}`, family.timezone);
    const endsAt = !allDay && endTime ? zonedLocalToUtcIso(`${date}T${endTime}`, family.timezone) : null;
    if (endsAt && endsAt < startsAt) throw new FieldError("End time must be after start time");

    const { error } = await supabase.from("events").insert({
      family_id: family.id,
      title,
      location: str(form, "location", 200),
      description: str(form, "description", 2000),
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: allDay || !startTime,
      assigned_to: assignee(form, members.map((m) => m.user_id)),
    });
    check(error);
    refresh();
  });
}

export async function deleteEvent(form: FormData) {
  const { supabase, family } = await requireFamily();
  const id = uuid(form, "id");
  if (!id) return;
  check((await supabase.from("events").delete().eq("id", id).eq("family_id", family.id)).error);
  refresh();
}

// ---------------------------------------------------------------- tasks

export async function addTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const { supabase, family, members } = await requireFamily();
    const points = Number(form.get("points") ?? 0);
    const { error } = await supabase.from("tasks").insert({
      family_id: family.id,
      title: requiredStr(form, "title", "Task"),
      notes: str(form, "notes", 2000),
      due_date: isoDate(form, "due_date"),
      points: Number.isInteger(points) && points >= 0 && points <= 1000 ? points : 0,
      assigned_to: assignee(form, members.map((m) => m.user_id)),
    });
    check(error);
    refresh();
  });
}

export async function toggleTask(form: FormData) {
  const { supabase, family, userId } = await requireFamily();
  const id = uuid(form, "id");
  if (!id) return;
  const done = form.get("done") === "true";
  check(
    (
      await supabase
        .from("tasks")
        .update(
          done
            ? { completed_at: null, completed_by: null }
            : { completed_at: new Date().toISOString(), completed_by: userId },
        )
        .eq("id", id)
        .eq("family_id", family.id)
    ).error,
  );
  refresh();
}

export async function deleteTask(form: FormData) {
  const { supabase, family } = await requireFamily();
  const id = uuid(form, "id");
  if (!id) return;
  check((await supabase.from("tasks").delete().eq("id", id).eq("family_id", family.id)).error);
  refresh();
}

// ---------------------------------------------------------------- shopping

export async function addShoppingItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const { supabase, family } = await requireFamily();
    const listId = uuid(form, "list_id");
    if (!listId) throw new FieldError("No shopping list selected");
    const { error } = await supabase.from("shopping_items").insert({
      family_id: family.id,
      list_id: listId,
      name: requiredStr(form, "name", "Item"),
      quantity: str(form, "quantity", 50),
    });
    check(error);
    refresh();
  });
}

export async function toggleShoppingItem(form: FormData) {
  const { supabase, family } = await requireFamily();
  const id = uuid(form, "id");
  if (!id) return;
  const checked = form.get("checked") === "true";
  check(
    (await supabase.from("shopping_items").update({ checked: !checked }).eq("id", id).eq("family_id", family.id))
      .error,
  );
  refresh();
}

export async function deleteShoppingItem(form: FormData) {
  const { supabase, family } = await requireFamily();
  const id = uuid(form, "id");
  if (!id) return;
  check((await supabase.from("shopping_items").delete().eq("id", id).eq("family_id", family.id)).error);
  refresh();
}

export async function clearCheckedItems(form: FormData) {
  const { supabase, family } = await requireFamily();
  const listId = uuid(form, "list_id");
  if (!listId) return;
  check(
    (
      await supabase
        .from("shopping_items")
        .delete()
        .eq("family_id", family.id)
        .eq("list_id", listId)
        .eq("checked", true)
    ).error,
  );
  refresh();
}

// ---------------------------------------------------------------- meals

export async function addMeal(_prev: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const { supabase, family } = await requireFamily();
    const date = isoDate(form, "date");
    if (!date) throw new FieldError("Date is required");
    const mealType = String(form.get("meal_type") ?? "dinner") as MealType;
    if (!MEAL_TYPES.includes(mealType)) throw new FieldError("Invalid meal type");
    const { error } = await supabase.from("meals").insert({
      family_id: family.id,
      date,
      meal_type: mealType,
      title: requiredStr(form, "title", "Meal"),
      notes: str(form, "notes", 1000),
    });
    check(error);
    refresh();
  });
}

export async function deleteMeal(form: FormData) {
  const { supabase, family } = await requireFamily();
  const id = uuid(form, "id");
  if (!id) return;
  check((await supabase.from("meals").delete().eq("id", id).eq("family_id", family.id)).error);
  refresh();
}
