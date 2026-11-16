"use client";

import Link from "next/link";
import { useFamily } from "@/components/family-provider";
import { InstallPrompt } from "@/components/pwa";
import { Avatar, Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { addDays, formatDay, formatTime, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";
import { check } from "@/lib/form";
import { useFamilyQuery } from "@/lib/use-family-query";

export function DashboardView() {
  const { family, me, members } = useFamily();
  const tz = family.timezone;
  const today = todayInZone(tz);

  const { data, error } = useFamilyQuery(
    async ({ supabase }) => {
      const [events, tasks, meals, shopping] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .eq("family_id", family.id)
          .gte("starts_at", zonedLocalToUtcIso(today, tz))
          .lt("starts_at", zonedLocalToUtcIso(addDays(today, 1), tz))
          .order("starts_at"),
        supabase
          .from("tasks")
          .select("*")
          .eq("family_id", family.id)
          .is("completed_at", null)
          .or(`due_date.is.null,due_date.lte.${today}`)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(8),
        supabase.from("meals").select("*").eq("family_id", family.id).eq("date", today),
        supabase
          .from("shopping_items")
          .select("id", { count: "exact", head: true })
          .eq("family_id", family.id)
          .eq("checked", false),
      ]);
      [events, tasks, meals, shopping].forEach((r) => check(r.error));
      return { events: events.data!, tasks: tasks.data!, meals: meals.data!, toBuy: shopping.count ?? 0 };
    },
    [today, tz],
    ["events", "tasks", "meals", "shopping_items"],
  );

  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const who = (id: string | null) => (id ? memberById.get(id) : undefined);

  return (
    <>
      <PageHeader title={`Hi ${me.display_name} 👋`} subtitle={`${family.name} · ${formatDay(today, { weekday: "long", year: "numeric" })}`} />
      <div className="mb-6">
        <InstallPrompt />
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      {!data ? (
        <Skeleton />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Today's schedule" action={<Link href="/calendar" className="text-sm text-indigo-600">Calendar →</Link>}>
            {data.events.length ? (
              <ul className="space-y-2">
                {data.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 tabular-nums text-zinc-500">{e.all_day ? "All day" : formatTime(e.starts_at, tz)}</span>
                    <span className="flex-1">{e.title}</span>
                    {who(e.assigned_to) && <Avatar name={who(e.assigned_to)!.display_name} color={who(e.assigned_to)!.color} />}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing on the calendar today.</Empty>
            )}
          </Card>

          <Card title="To do" action={<Link href="/tasks" className="text-sm text-indigo-600">All tasks →</Link>}>
            {data.tasks.length ? (
              <ul className="space-y-2">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <span className={`flex-1 ${t.due_date && t.due_date < today ? "text-red-600 dark:text-red-400" : ""}`}>{t.title}</span>
                    {who(t.assigned_to) && <Avatar name={who(t.assigned_to)!.display_name} color={who(t.assigned_to)!.color} />}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>All caught up 🎉</Empty>
            )}
          </Card>

          <Card title="Meals today" action={<Link href="/meals" className="text-sm text-indigo-600">Meal plan →</Link>}>
            {data.meals.length ? (
              <ul className="space-y-2 text-sm">
                {data.meals.map((m) => (
                  <li key={m.id} className="flex gap-3">
                    <span className="w-20 shrink-0 capitalize text-zinc-500">{m.meal_type}</span>
                    <span>{m.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No meals planned for today.</Empty>
            )}
          </Card>

          <Card title="Shopping" action={<Link href="/shopping" className="text-sm text-indigo-600">Open list →</Link>}>
            <p className="text-sm">
              <span className="text-3xl font-bold tabular-nums">{data.toBuy}</span>{" "}
              <span className="text-zinc-500">items still to buy</span>
            </p>
          </Card>
        </div>
      )}
    </>
  );
}
