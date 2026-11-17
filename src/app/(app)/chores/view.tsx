"use client";

import { ActButton } from "@/components/action-form";
import { RewardsComingSoon } from "@/components/coming-soon";
import { useFamily } from "@/components/family-provider";
import { Card, Empty, PageHeader, RestrictedNotice, Skeleton } from "@/components/ui";
import { formatDay, todayInZone } from "@/lib/dates";
import { check } from "@/lib/form";
import { toggleTask } from "@/lib/planner";
import type { Task } from "@/lib/supabase/types";
import { useFamilyQuery } from "@/lib/use-family-query";

/** Children's (and others') chores: what's mine, what anyone can do, and points so far. */
export function ChoresView() {
  const ctx = useFamily();
  const { family, userId, me } = ctx;
  const today = todayInZone(family.timezone);
  const blocked = ctx.blockedBy("tasks");

  const { data, error, reload } = useFamilyQuery(
    async ({ supabase }) => {
      const res = await supabase
        .from("tasks")
        .select("*")
        .eq("family_id", family.id)
        .is("event_id", null)
        .or(`assigned_to.eq.${userId},assigned_to.is.null,completed_by.eq.${userId}`)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200);
      check(res.error);
      return res.data!;
    },
    [userId],
    ["tasks"],
  );

  const mine = data?.filter((t) => t.assigned_to === userId && !t.completed_at) ?? [];
  const anyone = data?.filter((t) => t.assigned_to === null && !t.completed_at) ?? [];
  const done = data?.filter((t) => t.completed_by === userId && t.completed_at) ?? [];
  const points = done.reduce((n, t) => n + t.points, 0);

  const Row = ({ t }: { t: Task }) => (
    <li className="flex items-center gap-3 py-3">
      <ActButton
        run={async () => {
          await toggleTask(ctx, t.id, Boolean(t.completed_at));
          await reload();
        }}
        label={t.completed_at ? "Not done yet" : "Done!"}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-lg ${
          t.completed_at ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"
        }`}
      >
        {t.completed_at ? "✓" : ""}
      </ActButton>
      <span className={`flex-1 text-[16px] ${t.completed_at ? "text-muted line-through" : ""}`}>{t.title}</span>
      {t.due_date && !t.completed_at && (
        <span className={`text-sm ${t.due_date < today ? "font-semibold text-red-600" : "text-muted"}`}>
          {t.due_date === today ? "Today" : formatDay(t.due_date)}
        </span>
      )}
      {t.points > 0 && <span className="text-sm font-semibold text-amber-600">★ {t.points}</span>}
    </li>
  );

  return (
    <>
      <PageHeader title="My chores" subtitle={`Nice work, ${me.display_name}!`} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <RestrictedNotice rule={blocked} what="chores" />
      {!data ? (
        <Skeleton />
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <Card title={`To do (${mine.length})`}>
              {mine.length === 0 ? <Empty>No chores right now 🎉</Empty> : <ul className="divide-y divide-line/60">{mine.map((t) => <Row key={t.id} t={t} />)}</ul>}
            </Card>
            {anyone.length > 0 && (
              <Card title="Anyone can do these">
                <ul className="divide-y divide-line/60">{anyone.map((t) => <Row key={t.id} t={t} />)}</ul>
              </Card>
            )}
            {done.length > 0 && (
              <Card title="Done">
                <ul className="divide-y divide-line/60">{done.slice(0, 15).map((t) => <Row key={t.id} t={t} />)}</ul>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-amber-50 p-5 text-center">
              <p className="text-sm font-semibold text-amber-800">My points</p>
              <p className="text-5xl font-bold text-amber-600">★ {points}</p>
            </div>
            <RewardsComingSoon />
          </div>
        </div>
      )}
    </>
  );
}
