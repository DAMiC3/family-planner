"use client";

import Link from "next/link";
import { useState } from "react";
import { ActButton } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { InstallPrompt } from "@/components/pwa";
import { EventSheet, StatusBadge } from "@/components/add-event-sheet";
import { SlotCard } from "@/components/slot-card";
import { Card, Empty, PageHeader, RoleBadge, Skeleton } from "@/components/ui";
import { addDays, dateInZone, formatDay, formatTime, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import { check } from "@/lib/form";
import { shortAddress } from "@/lib/geo";
import { respondToInvite, toggleTask } from "@/lib/planner";
import type { CalendarEvent } from "@/lib/supabase/types";
import { describeRule, ruleAppliesTo } from "@/lib/rules";
import { loadSlotExtras } from "@/lib/slot-data";
import { useFamilyQuery } from "@/lib/use-family-query";

/** "My program": what's on for me over the next 7 days. */
export function ProgramView() {
  const ctx = useFamily();
  const { family, me, userId } = ctx;
  const tz = family.timezone;
  const today = todayInZone(tz);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const { data, error, reload } = useFamilyQuery(
    async (c) => {
      const [events, tasks, meals] = await Promise.all([
        c.supabase
          .from("events")
          .select("*")
          .eq("family_id", family.id)
          .neq("status", "declined")
          .gte("starts_at", zonedLocalToUtcIso(today, tz))
          .lt("starts_at", zonedLocalToUtcIso(addDays(today, 7), tz))
          .order("starts_at"),
        c.supabase
          .from("tasks")
          .select("*")
          .eq("family_id", family.id)
          .is("completed_at", null)
          .or(`assigned_to.is.null,assigned_to.eq.${userId}`)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(30),
        c.supabase.from("meals").select("*").eq("family_id", family.id).gte("date", today).lte("date", addDays(today, 6)),
      ]);
      [events, tasks, meals].forEach((r) => check(r.error));
      const extras = await loadSlotExtras(c, events.data!);
      const invitedTo = new Set(extras.invites.filter((i) => i.user_id === userId && i.status !== "declined").map((i) => i.event_id));
      // Mine: for everyone, for me, I drive, I made it, or I'm invited.
      const mine = events.data!.filter(
        (e) =>
          e.assigned_to === null || e.assigned_to === userId || e.driver_id === userId || e.created_by === userId || invitedTo.has(e.id),
      );
      return { events: mine, tasks: tasks.data!, meals: meals.data!, ...extras };
    },
    [today, tz, userId],
    ["events", "tasks", "meals", "activity_requests", "activity_votes", "event_invites"],
  );

  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const myRules = ctx.rules.filter((r) => ruleAppliesTo(r, me));
  const pendingInvites = data?.invites.filter((i) => i.user_id === userId && i.status === "pending") ?? [];
  const myTasks = data?.tasks.filter((t) => t.assigned_to === userId) ?? [];
  const openTasks = data?.tasks.filter((t) => t.assigned_to === null) ?? [];

  return (
    <>
      <PageHeader title={`${me.display_name}'s program`} subtitle={`${family.name} · next 7 days`} />
      <div className="mb-6 space-y-3">
        <InstallPrompt />
        {myRules.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">🔒 House rules for you</p>
            <ul className="mt-1 list-disc pl-5">
              {myRules.map((r) => {
                const d = describeRule(r, ctx.members);
                return (
                  <li key={r.id}>
                    No changes to {d.what} — {d.when}
                    {r.note ? ` (“${r.note}”)` : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {data && pendingInvites.length > 0 && (
        <div className="mb-6 space-y-2">
          {pendingInvites.map((inv) => {
            const e = data.events.find((x) => x.id === inv.event_id);
            if (!e) return null;
            const from = ctx.members.find((m) => m.user_id === inv.invited_by)?.display_name ?? "Someone";
            return (
              <div key={inv.event_id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">📨 {from} invited you to {e.title}</p>
                  <p className="text-sm text-muted">
                    {formatDay(dateInZone(new Date(e.starts_at), tz), { weekday: "long" })}
                    {e.all_day ? "" : ` · ${formatTime(e.starts_at, tz)}`}
                    {e.invitees_can_edit ? " · you'll be able to change it" : " · view only"}
                  </p>
                </div>
                <ActButton run={() => respondToInvite(ctx, e.id, "accepted")} label="Accept" className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white">
                  Accept
                </ActButton>
                <ActButton run={() => respondToInvite(ctx, e.id, "declined")} label="Decline" className="rounded-xl border border-line bg-white px-4 py-2 font-semibold">
                  Decline
                </ActButton>
              </div>
            );
          })}
        </div>
      )}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <div className="divide-y divide-zinc-100">
              {days.map((day) => {
                const events = data.events.filter((e) => dateInZone(new Date(e.starts_at), tz) === day);
                const meals = data.meals.filter((m) => m.date === day);
                const due = myTasks.filter((t) => t.due_date === day);
                const empty = !events.length && !meals.length && !due.length;
                return (
                  <section key={day} className="py-3">
                    <h3 className={`mb-2 text-sm font-semibold ${day === today ? "text-brand-600" : "text-zinc-500"}`}>
                      {day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : formatDay(day, { weekday: "long" })}
                    </h3>
                    {empty && <p className="text-sm text-zinc-400">Free day 🎈</p>}
                    <ul className="space-y-2 text-sm">
                      {events.map((e) =>
                        e.kind === "slot" ? (
                          <li key={e.id}>
                            <SlotCard slot={e} requests={data.requests.filter((r) => r.event_id === e.id)} votes={data.votes} ctx={ctx} reload={reload} />
                          </li>
                        ) : (
                          <li key={e.id}>
                            <button type="button" onClick={() => setOpenEvent(e)} className="flex w-full gap-3 text-left">
                            <span className="w-16 shrink-0 tabular-nums text-muted">{e.all_day ? "All day" : formatTime(e.starts_at, tz)}</span>
                            <span className="min-w-0 flex-1">
                              {e.title}
                              {e.assigned_to === null && <span className="ml-1 text-xs text-muted">(everyone)</span>}
                              {e.driver_id === userId && (
                                <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">🚗 YOU DRIVE</span>
                              )}
                              {e.status === "pending" && <span className="ml-2"><StatusBadge event={e} /></span>}
                              {e.location && <span className="block truncate text-muted">📍 {shortAddress(e.location)}</span>}
                            </span>
                            </button>
                          </li>
                        ),
                      )}
                      {due.map((t) => (
                        <li key={t.id} className="flex gap-3">
                          <span className="w-16 shrink-0 text-zinc-500">Task</span>
                          <span className="flex-1">{t.title}</span>
                        </li>
                      ))}
                      {meals.map((m) => (
                        <li key={m.id} className="flex gap-3">
                          <span className="w-16 shrink-0 capitalize text-zinc-500">{m.meal_type}</span>
                          <span className="flex-1">🍽️ {m.title}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title="My tasks" action={<Link href="/tasks" className="text-sm text-brand-600">All →</Link>}>
              {myTasks.length === 0 && openTasks.length === 0 ? (
                <Empty>Nothing to do 🎉</Empty>
              ) : (
                <ul className="space-y-2 text-sm">
                  {[...myTasks, ...openTasks].map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      <ActButton
                        run={async () => { await toggleTask(ctx, t.id, false); await reload(); }}
                        label="Mark done"
                        className="h-6 w-6 shrink-0 rounded border border-zinc-400 hover:border-brand-500"
                      >
                        {""}
                      </ActButton>
                      <span className={`flex-1 ${t.due_date && t.due_date < today ? "text-red-600" : ""}`}>{t.title}</span>
                      {t.assigned_to === null && <span className="text-xs text-zinc-400">anyone</span>}
                      {t.points > 0 && <span className="text-xs text-amber-600">★ {t.points}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Me">
              <p className="flex items-center gap-2 text-sm">
                {me.display_name} <RoleBadge role={me.role} />
              </p>
            </Card>
          </div>
        </div>
      )}
      <EventSheet open={openEvent !== null} event={openEvent} invites={data?.invites ?? []} onClose={() => setOpenEvent(null)} />
    </>
  );
}
