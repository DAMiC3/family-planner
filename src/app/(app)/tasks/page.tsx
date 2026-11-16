import type { Metadata } from "next";
import { Suspense } from "react";
import { addTask, deleteTask, toggleTask } from "@/app/actions/planner";
import { ActionForm } from "@/components/action-form";
import { Avatar, Card, Empty, Field, IdButton, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { requireFamily } from "@/lib/family";
import { formatDay, todayInZone } from "@/lib/dates";
import type { FamilyMember, Task } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <>
      <PageHeader title="Tasks & chores" subtitle="Who's doing what" />
      <Suspense fallback={<Skeleton />}>
        <Tasks />
      </Suspense>
    </>
  );
}

async function Tasks() {
  const { supabase, family, members } = await requireFamily();
  const today = todayInZone(family.timezone);

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("family_id", family.id)
    .order("completed_at", { ascending: false, nullsFirst: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const open = data.filter((t) => !t.completed_at);
  const done = data.filter((t) => t.completed_at).slice(0, 20);
  const memberById = new Map(members.map((m) => [m.user_id, m]));

  // Points leaderboard from completed tasks this list includes.
  const points = new Map<string, number>();
  for (const t of data) if (t.completed_by) points.set(t.completed_by, (points.get(t.completed_by) ?? 0) + t.points);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card title={`To do (${open.length})`}>
          {open.length ? <TaskList tasks={open} memberById={memberById} today={today} /> : <Empty>Nothing to do 🎉</Empty>}
        </Card>
        {done.length > 0 && (
          <Card title="Recently done">
            <TaskList tasks={done} memberById={memberById} today={today} />
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card title="Add task">
          <ActionForm action={addTask} submitLabel="Add task">
            <Field label="Task">
              <Input name="title" required maxLength={200} placeholder="Empty the dishwasher" />
            </Field>
            <Field label="Who">
              <Select name="assigned_to" defaultValue="">
                <option value="">Anyone</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due">
                <Input name="due_date" type="date" />
              </Field>
              <Field label="Points">
                <Input name="points" type="number" min={0} max={1000} defaultValue={0} />
              </Field>
            </div>
          </ActionForm>
        </Card>
        {points.size > 0 && (
          <Card title="Points">
            <ul className="space-y-2 text-sm">
              {[...points.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([uid, pts]) => {
                  const m = memberById.get(uid);
                  return (
                    <li key={uid} className="flex items-center gap-2">
                      {m && <Avatar name={m.display_name} color={m.color} />}
                      <span className="flex-1">{m?.display_name ?? "Former member"}</span>
                      <span className="font-semibold tabular-nums">{pts}</span>
                    </li>
                  );
                })}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function TaskList({ tasks, memberById, today }: { tasks: Task[]; memberById: Map<string, FamilyMember>; today: string }) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {tasks.map((t) => {
        const who = t.assigned_to ? memberById.get(t.assigned_to) : undefined;
        const overdue = !t.completed_at && t.due_date && t.due_date < today;
        return (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <IdButton
              action={toggleTask}
              id={t.id}
              extra={{ done: String(Boolean(t.completed_at)) }}
              label={t.completed_at ? "Mark not done" : "Mark done"}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                t.completed_at ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400 hover:border-indigo-500"
              }`}
            >
              {t.completed_at ? "✓" : ""}
            </IdButton>
            <span className={`flex-1 ${t.completed_at ? "text-zinc-400 line-through" : ""}`}>{t.title}</span>
            {t.points > 0 && <span className="text-xs text-amber-600">★ {t.points}</span>}
            {t.due_date && (
              <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-zinc-500"}`}>
                {t.due_date === today ? "Today" : formatDay(t.due_date)}
              </span>
            )}
            {who && <Avatar name={who.display_name} color={who.color} />}
            <IdButton action={deleteTask} id={t.id} label="Delete task" className="text-zinc-400 hover:text-red-600">
              ✕
            </IdButton>
          </li>
        );
      })}
    </ul>
  );
}
