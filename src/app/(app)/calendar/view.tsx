"use client";

import { useState } from "react";
import { ActButton, Button } from "@/components/action-form";
import { EventForm } from "@/components/event-form";
import { useFamily } from "@/components/family-provider";
import { SlotCard } from "@/components/slot-card";
import { Avatar, Card, Empty, PageHeader, RestrictedNotice, Skeleton } from "@/components/ui";
import { addDays, dateInZone, formatDay, formatTime, startOfWeek, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import { check } from "@/lib/form";
import { deleteEvent } from "@/lib/planner";
import { loadSlotExtras } from "@/lib/slot-data";
import { useFamilyQuery } from "@/lib/use-family-query";

export function CalendarView() {
  const ctx = useFamily();
  const { family, members } = ctx;
  const tz = family.timezone;
  const today = todayInZone(tz);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data, error, reload } = useFamilyQuery(
    async (c) => {
      const res = await c.supabase
        .from("events")
        .select("*")
        .eq("family_id", family.id)
        .gte("starts_at", zonedLocalToUtcIso(weekStart, tz))
        .lt("starts_at", zonedLocalToUtcIso(addDays(weekStart, 7), tz))
        .order("starts_at");
      check(res.error);
      return { events: res.data!, ...(await loadSlotExtras(c, res.data!)) };
    },
    [weekStart, tz],
    ["events", "activity_requests", "activity_votes"],
  );

  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const blocked = ctx.blockedBy("events");

  return (
    <>
      <PageHeader title="Family calendar" subtitle="Everyone's events and activity slots" />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card
          title={`Week of ${formatDay(weekStart, { weekday: undefined })}`}
          action={
            <div className="flex gap-1">
              <Button variant="ghost" className="px-2 py-1" onClick={() => setWeekStart(addDays(weekStart, -7))}>←</Button>
              <Button variant="ghost" className="px-2 py-1" onClick={() => setWeekStart(startOfWeek(today))}>Today</Button>
              <Button variant="ghost" className="px-2 py-1" onClick={() => setWeekStart(addDays(weekStart, 7))}>→</Button>
            </div>
          }
        >
          {!data ? (
            <Skeleton />
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {days.map((day) => {
                const events = data.events.filter((e) => dateInZone(new Date(e.starts_at), tz) === day);
                return (
                  <div key={day} className="py-3">
                    <h3 className={`mb-2 text-sm font-semibold ${day === today ? "text-indigo-600" : "text-zinc-500"}`}>
                      {day === today ? "Today · " : ""}
                      {formatDay(day, { weekday: "long" })}
                    </h3>
                    {events.length === 0 ? (
                      <p className="text-sm text-zinc-400">—</p>
                    ) : (
                      <ul className="space-y-2">
                        {events.map((e) =>
                          e.kind === "slot" ? (
                            <li key={e.id}>
                              <SlotCard
                                slot={e}
                                requests={data.requests.filter((r) => r.event_id === e.id)}
                                votes={data.votes}
                                ctx={ctx}
                                reload={reload}
                              />
                            </li>
                          ) : (
                            <li key={e.id} className="flex items-start gap-3 text-sm">
                              <span className="w-24 shrink-0 tabular-nums text-zinc-500">
                                {e.all_day ? "All day" : `${formatTime(e.starts_at, tz)}${e.ends_at ? `–${formatTime(e.ends_at, tz)}` : ""}`}
                              </span>
                              <div className="flex-1">
                                <p className="font-medium">{e.title}</p>
                                {e.location && <p className="text-zinc-500">📍 {e.location}</p>}
                              </div>
                              {e.assigned_to && memberById.get(e.assigned_to) && (
                                <Avatar name={memberById.get(e.assigned_to)!.display_name} color={memberById.get(e.assigned_to)!.color} />
                              )}
                              {!blocked && (
                                <ActButton
                                  run={async () => { await deleteEvent(ctx, e.id); await reload(); }}
                                  label="Delete event"
                                  className="px-1 text-zinc-400 hover:text-red-600"
                                >
                                  ✕
                                </ActButton>
                              )}
                            </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {data && data.events.length === 0 && <Empty>Nothing planned this week.</Empty>}
        </Card>

        <Card title={ctx.isParent ? "Add event or slot" : "Add event"}>
          <RestrictedNotice rule={blocked} what="adding to the calendar" />
          {!blocked && <EventForm ctx={ctx} defaultDate={days.includes(today) ? today : weekStart} reload={reload} />}
        </Card>
      </div>
    </>
  );
}
