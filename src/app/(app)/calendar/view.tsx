"use client";

import { useState } from "react";
import { ActButton, ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { EventSheet, StatusBadge } from "@/components/add-event-sheet";
import { SlotCard } from "@/components/slot-card";
import { Avatar, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { addDays, dateInZone, formatDay, formatTime, startOfWeek, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import { check } from "@/lib/form";
import { shortAddress } from "@/lib/geo";
import { MEAL_TYPES, addMeal, deleteMeal, setEventStatus } from "@/lib/planner";
import type { CalendarEvent } from "@/lib/supabase/types";
import { loadSlotExtras } from "@/lib/slot-data";
import { useFamilyQuery } from "@/lib/use-family-query";

const MEAL_ICON: Record<string, string> = { breakfast: "🥣", lunch: "🥪", dinner: "🍽️", snack: "🍎" };

/** The family's week: events, activity slots and meals, day by day. */
export function CalendarView() {
  const ctx = useFamily();
  const { family, members } = ctx;
  const tz = family.timezone;
  const today = todayInZone(tz);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [mealDay, setMealDay] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const blockedMeals = ctx.blockedBy("meals");

  const { data, error, reload } = useFamilyQuery(
    async (c) => {
      const [events, meals] = await Promise.all([
        c.supabase
          .from("events")
          .select("*")
          .eq("family_id", family.id)
          .gte("starts_at", zonedLocalToUtcIso(weekStart, tz))
          .lt("starts_at", zonedLocalToUtcIso(addDays(weekStart, 7), tz))
          .order("starts_at"),
        c.supabase.from("meals").select("*").eq("family_id", family.id).gte("date", weekStart).lte("date", addDays(weekStart, 6)),
      ]);
      check(events.error);
      check(meals.error);
      return { events: events.data!, meals: meals.data!, ...(await loadSlotExtras(c, events.data!)) };
    },
    [weekStart, tz],
    ["events", "meals", "activity_requests", "activity_votes", "event_invites"],
  );

  const memberById = new Map(members.map((m) => [m.user_id, m]));

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <PageHeader title="Calendar" subtitle={`Week of ${formatDay(weekStart, { weekday: undefined })}`} />
        <div className="mb-6 flex gap-1">
          <Button variant="ghost" className="px-3 py-2" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</Button>
          <Button variant="ghost" className="px-3 py-2" onClick={() => setWeekStart(startOfWeek(today))}>Today</Button>
          <Button variant="ghost" className="px-3 py-2" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const events = data.events.filter((e) => dateInZone(new Date(e.starts_at), tz) === day);
            const meals = data.meals
              .filter((m) => m.date === day)
              .sort((a, b) => MEAL_TYPES.indexOf(a.meal_type) - MEAL_TYPES.indexOf(b.meal_type));
            const isToday = day === today;
            return (
              <section key={day} className={`rounded-2xl border p-4 ${isToday ? "border-ink" : "border-line/70"}`}>
                <h2 className="mb-2 flex items-baseline gap-2">
                  <span className="text-lg font-semibold">{formatDay(day, { weekday: "long", month: undefined, day: undefined })}</span>
                  <span className="text-sm text-muted">{formatDay(day, { weekday: undefined })}</span>
                  {isToday && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">TODAY</span>}
                </h2>

                {events.length === 0 && meals.length === 0 && <p className="text-[15px] text-muted">Nothing planned</p>}

                <ul className="space-y-2">
                  {events.map((e) => {
                    if (e.kind === "slot") {
                      return (
                        <li key={e.id}>
                          <SlotCard slot={e} requests={data.requests.filter((r) => r.event_id === e.id)} votes={data.votes} ctx={ctx} reload={reload} />
                        </li>
                      );
                    }
                    const who = e.assigned_to ? memberById.get(e.assigned_to) : undefined;
                    const driver = e.driver_id ? memberById.get(e.driver_id) : undefined;
                    const invited = data.invites.filter((i) => i.event_id === e.id && i.status !== "declined");
                    return (
                      <li key={e.id} className={e.status === "declined" ? "opacity-50" : ""}>
                        <button type="button" onClick={() => setOpenEvent(e)} className="flex w-full items-start gap-3 text-left">
                          <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">
                            {e.all_day ? "All day" : formatTime(e.starts_at, tz)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {e.title} <StatusBadge event={e} />
                            </p>
                            {e.location && <p className="truncate text-sm text-muted">📍 {shortAddress(e.location)}</p>}
                            {e.lat != null && e.status === "approved" && (
                              <p className="text-sm text-muted">{driver ? `🚗 ${driver.display_name}` : <span className="text-brand-600">🚗 Needs a driver</span>}</p>
                            )}
                            {invited.length > 0 && (
                              <p className="text-sm text-muted">
                                👥 {invited.map((i) => memberById.get(i.user_id)?.display_name).filter(Boolean).join(", ")}
                              </p>
                            )}
                          </div>
                          {who && <Avatar name={who.display_name} color={who.color} />}
                        </button>
                        {ctx.isParent && e.status === "pending" && (
                          <div className="mt-2 flex gap-2 pl-[60px]">
                            <ActButton
                              run={() => setEventStatus(ctx, e.id, "approved")}
                              label="Approve"
                              className="rounded-full bg-brand-600 px-3 py-1 text-sm font-semibold text-white"
                            >
                              Approve
                            </ActButton>
                            <ActButton run={() => setEventStatus(ctx, e.id, "declined")} label="Decline" className="rounded-full border border-line px-3 py-1 text-sm font-semibold">
                              Decline
                            </ActButton>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {(meals.length > 0 || !blockedMeals) && (
                  <div className={`${events.length ? "mt-3 border-t border-line/60 pt-3" : "mt-1"}`}>
                    <ul className="space-y-1">
                      {meals.map((m) => (
                        <li key={m.id} className="flex items-center gap-2 text-[15px]">
                          <span aria-hidden>{MEAL_ICON[m.meal_type]}</span>
                          <span className="w-20 shrink-0 text-sm capitalize text-muted">{m.meal_type}</span>
                          <span className="flex-1">{m.title}</span>
                          {!blockedMeals && (
                            <ActButton run={async () => { await deleteMeal(ctx, m.id); await reload(); }} label="Remove meal" className="px-1 text-muted hover:text-red-600">
                              ✕
                            </ActButton>
                          )}
                        </li>
                      ))}
                    </ul>
                    {!blockedMeals &&
                      (mealDay === day ? (
                        <ActionForm
                          onSubmit={async (f) => {
                            await addMeal(ctx, f);
                            setMealDay(null);
                            await reload();
                          }}
                          submitLabel="Add"
                          className="mt-2 flex flex-wrap gap-2"
                        >
                          <input type="hidden" name="date" value={day} />
                          <Select name="meal_type" defaultValue="dinner" className="w-auto py-2" aria-label="Meal">
                            {MEAL_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t[0].toUpperCase() + t.slice(1)}
                              </option>
                            ))}
                          </Select>
                          <Input name="title" required maxLength={200} placeholder="Spaghetti" className="min-w-0 flex-1 py-2" aria-label="What's cooking" autoFocus />
                        </ActionForm>
                      ) : (
                        <button type="button" onClick={() => setMealDay(day)} className="mt-1 text-sm font-semibold text-ink underline underline-offset-2">
                          + Meal
                        </button>
                      ))}
                  </div>
                )}
              </section>
            );
          })}
          <p className="pt-2 text-center text-sm text-muted">Tap an event to open it · tap the red + to add one.</p>
        </div>
      )}
      <EventSheet open={openEvent !== null} event={openEvent} invites={data?.invites ?? []} onClose={() => setOpenEvent(null)} />
    </>
  );
}
