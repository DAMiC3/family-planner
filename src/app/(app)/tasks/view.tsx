"use client";

import { ActButton, ActionForm } from "@/components/action-form";
import { useFamily, type FamilyContextValue } from "@/components/family-provider";
import { Avatar, Card, Empty, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { formatDay, todayInZone } from "@/lib/dates";
import { check } from "@/lib/form";
import { addTask, deleteTask, toggleTask } from "@/lib/planner";
import type { Task } from "@/lib/supabase/types";
import { useFamilyQuery } from "@/lib/use-family-query";

export function TasksView() {
  const ctx = useFamily();
  const { family, members } = ctx;
  const today = todayInZone(family.timezone);

  const { data, error, reload } = useFamilyQuery(
    async ({ supabase }) => {
      const res = await supabase
        .from("tasks")
        .select("*")
        .eq("family_id", family.id)
        .order("completed_at", { ascending: false, nullsFirst: true })
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200);
      check(res.error);
      return res.data!;
    },
    [],
    ["tasks"],
  );

  const open = (data ?? []).filter((t) => !t.completed_at);
  const done = (data ?? []).filter((t) => t.completed_at).slice(0, 20);
  const memberById = new Map(members.map((m) => [m.user_id, m]));
  const points = new Map<string, number>();
  for (const t of data ?? []) if (t.completed_by) points.set(t.completed_by, (points.get(t.completed_by) ?? 0) + t.points);

  return (
    <>
      <PageHeader title="Tasks & chores" subtitle="Who's doing what" />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title={`To do (${open.length})`}>
            {!data ? <Skeleton /> : open.length ? <TaskList tasks={open} ctx={ctx} today={today} reload={reload} /> : <Empty>Nothing to do 🎉</Empty>}
          </Card>
          {done.length > 0 && (
            <Card title="Recently done">
              <TaskList tasks={done} ctx={ctx} today={today} reload={reload} />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Add task">
            <ActionForm onSubmit={async (f) => { await addTask(ctx, f); await reload(); }} submitLabel="Add task">
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
    </>
  );
}

function TaskList({ tasks, ctx, today, reload }: { tasks: Task[]; ctx: FamilyContextValue; today: string; reload: () => Promise<void> }) {
  const memberById = new Map(ctx.members.map((m) => [m.user_id, m]));
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {tasks.map((t) => {
        const who = t.assigned_to ? memberById.get(t.assigned_to) : undefined;
        const overdue = !t.completed_at && t.due_date && t.due_date < today;
        return (
          <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
            <ActButton
              run={async () => { await toggleTask(ctx, t.id, Boolean(t.completed_at)); await reload(); }}
              label={t.completed_at ? "Mark not done" : "Mark done"}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${
                t.completed_at ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-400 hover:border-indigo-500"
              }`}
            >
              {t.completed_at ? "✓" : ""}
            </ActButton>
            <span className={`flex-1 ${t.completed_at ? "text-zinc-400 line-through" : ""}`}>{t.title}</span>
            {t.points > 0 && <span className="text-xs text-amber-600">★ {t.points}</span>}
            {t.due_date && (
              <span className={`text-xs ${overdue ? "font-semibold text-red-600" : "text-zinc-500"}`}>
                {t.due_date === today ? "Today" : formatDay(t.due_date)}
              </span>
            )}
            {who && <Avatar name={who.display_name} color={who.color} />}
            <ActButton run={async () => { await deleteTask(ctx, t.id); await reload(); }} label="Delete task" className="px-1 text-zinc-400 hover:text-red-600">
              ✕
            </ActButton>
          </li>
        );
      })}
    </ul>
  );
}
