import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar, Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { requireFamily } from "@/lib/family";
import { addDays, formatDay, formatTime, todayInZone, zonedLocalToUtcIso } from "@/lib/dates";

export const metadata: Metadata = { title: "Today" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { supabase, family, me, members } = await requireFamily();
  const tz = family.timezone;
  const today = todayInZone(tz);
  const dayStart = zonedLocalToUtcIso(today, tz);
  const dayEnd = zonedLocalToUtcIso(addDays(today, 1), tz);

  const [events, tasks, meals, shopping] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("family_id", family.id)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .order("starts_at"),
    supabase
      .from("tasks")
      .select("*")
      .eq("family_id", family.id)
      .is("completed_at", null)
      .or(`due_date.is.null,due_date.lte.${today}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase.from("meals").select("*").eq("family_id", family.id).eq("date", today).order("meal_type"),
    supabase
      .from("shopping_items")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .eq("checked", false),
  ]);

  const memberById = new Map(members.map((m) => [m.user_id, m]));

  return (
    <>
      <PageHeader title={`Hi ${me.display_name} 👋`} subtitle={`${family.name} · ${formatDay(today, { weekday: "long", year: "numeric" })}`} />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Today's schedule" action={<Link href="/calendar" className="text-sm text-indigo-600">Calendar →</Link>}>
          {events.data?.length ? (
            <ul className="space-y-2">
              {events.data.map((e) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-zinc-500">{e.all_day ? "All day" : formatTime(e.starts_at, tz)}</span>
                  <span className="flex-1">{e.title}</span>
                  {e.assigned_to && memberById.get(e.assigned_to) && (
                    <Avatar name={memberById.get(e.assigned_to)!.display_name} color={memberById.get(e.assigned_to)!.color} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing on the calendar today.</Empty>
          )}
        </Card>

        <Card title="To do" action={<Link href="/tasks" className="text-sm text-indigo-600">All tasks →</Link>}>
          {tasks.data?.length ? (
            <ul className="space-y-2">
              {tasks.data.map((t) => (
                <li key={t.id} className="flex items-center gap-3 text-sm">
                  <span className={`flex-1 ${t.due_date && t.due_date < today ? "text-red-600 dark:text-red-400" : ""}`}>{t.title}</span>
                  {t.assigned_to && memberById.get(t.assigned_to) && (
                    <Avatar name={memberById.get(t.assigned_to)!.display_name} color={memberById.get(t.assigned_to)!.color} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>All caught up 🎉</Empty>
          )}
        </Card>

        <Card title="Meals today" action={<Link href="/meals" className="text-sm text-indigo-600">Meal plan →</Link>}>
          {meals.data?.length ? (
            <ul className="space-y-2 text-sm">
              {meals.data.map((m) => (
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
            <span className="text-3xl font-bold tabular-nums">{shopping.count ?? 0}</span>{" "}
            <span className="text-zinc-500">items still to buy</span>
          </p>
        </Card>
      </div>
    </>
  );
}
