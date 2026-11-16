import type { Metadata } from "next";
import { Suspense } from "react";
import { addEvent, deleteEvent } from "@/app/actions/planner";
import { ActionForm } from "@/components/action-form";
import { Avatar, Card, Empty, Field, IdButton, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { requireFamily } from "@/lib/family";
import { addDays, dateInZone, formatDay, formatTime, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import type { CalendarEvent } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" subtitle="What's coming up over the next four weeks" />
      <Suspense fallback={<Skeleton />}>
        <Calendar />
      </Suspense>
    </>
  );
}

async function Calendar() {
  const { supabase, family, members } = await requireFamily();
  const tz = family.timezone;
  const today = todayInZone(tz);

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("family_id", family.id)
    .gte("starts_at", zonedLocalToUtcIso(today, tz))
    .lt("starts_at", zonedLocalToUtcIso(addDays(today, 28), tz))
    .order("starts_at");
  if (error) throw new Error(error.message);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of data) {
    const day = dateInZone(new Date(e.starts_at), tz);
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        {byDay.size === 0 ? (
          <Empty>No events yet. Add one to get started.</Empty>
        ) : (
          <div className="space-y-6">
            {[...byDay.entries()].map(([day, events]) => (
              <div key={day}>
                <h3 className="mb-2 text-sm font-semibold text-zinc-500">
                  {day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : formatDay(day, { weekday: "long" })}
                </h3>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {events.map((e) => {
                    const who = e.assigned_to ? memberById.get(e.assigned_to) : undefined;
                    return (
                      <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
                        <span className="w-24 shrink-0 tabular-nums text-zinc-500">
                          {e.all_day ? "All day" : `${formatTime(e.starts_at, tz)}${e.ends_at ? `–${formatTime(e.ends_at, tz)}` : ""}`}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium">{e.title}</p>
                          {e.location && <p className="text-zinc-500">📍 {e.location}</p>}
                          {e.description && <p className="text-zinc-500">{e.description}</p>}
                        </div>
                        {who && <Avatar name={who.display_name} color={who.color} />}
                        <IdButton action={deleteEvent} id={e.id} label="Delete event" className="text-zinc-400 hover:text-red-600">
                          ✕
                        </IdButton>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Add event">
        <ActionForm action={addEvent} submitLabel="Add event">
          <Field label="Title">
            <Input name="title" required maxLength={200} placeholder="Swimming lesson" />
          </Field>
          <Field label="Date">
            <Input name="date" type="date" defaultValue={today} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input name="start_time" type="time" />
            </Field>
            <Field label="Ends">
              <Input name="end_time" type="time" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="all_day" /> All day
          </label>
          <Field label="Location">
            <Input name="location" maxLength={200} />
          </Field>
          <Field label="Who">
            <Select name="assigned_to" defaultValue="">
              <option value="">Everyone</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
