"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActButton, ActionForm } from "@/components/action-form";
import { CarsSheet } from "@/components/cars-sheet";
import { RewardsComingSoon } from "@/components/coming-soon";
import { useFamily } from "@/components/family-provider";
import { Avatar, Card, Empty, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { formatDay, todayInZone } from "@/lib/dates";
import { check } from "@/lib/form";
import { addTask, toggleTask } from "@/lib/planner";
import { useFamilyQuery } from "@/lib/use-family-query";

/** Parents' hub: what needs attention, chores per child, and family settings. */
export function ManageView() {
  const ctx = useFamily();
  const { family, members, isParent } = ctx;
  const router = useRouter();
  const [showCars, setShowCars] = useState(false);
  const today = todayInZone(family.timezone);

  useEffect(() => {
    if (!isParent) router.replace("/chores");
  }, [isParent, router]);

  const { data, error, reload } = useFamilyQuery(
    async ({ supabase }) => {
      const now = new Date().toISOString();
      const [pending, noCar, tasks] = await Promise.all([
        supabase.from("events").select("id", { count: "exact", head: true }).eq("family_id", family.id).eq("status", "pending"),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("family_id", family.id)
          .eq("kind", "event")
          .eq("status", "approved")
          .is("car_id", null)
          .not("lat", "is", null)
          .gt("starts_at", now),
        supabase.from("tasks").select("*").eq("family_id", family.id).order("due_date", { ascending: true, nullsFirst: false }).limit(300),
      ]);
      check(pending.error);
      check(noCar.error);
      check(tasks.error);
      return { pending: pending.count ?? 0, noCar: noCar.count ?? 0, tasks: tasks.data! };
    },
    [],
    ["events", "tasks"],
  );

  if (!isParent) return null;
  const kids = members.filter((m) => m.role !== "parent");

  return (
    <>
      <PageHeader title="Manage" subtitle={family.name} />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Needs your attention">
          {!data ? (
            <Skeleton />
          ) : data.pending === 0 && data.noCar === 0 ? (
            <Empty>All sorted 👌</Empty>
          ) : (
            <ul className="space-y-2">
              {data.pending > 0 && (
                <li>
                  <Link href="/calendar" className="flex items-center justify-between rounded-xl bg-amber-50 p-3 font-medium">
                    ⏳ {data.pending} {data.pending === 1 ? "event waits" : "events wait"} for your approval <span>›</span>
                  </Link>
                </li>
              )}
              {data.noCar > 0 && (
                <li>
                  <Link href="/map" className="flex items-center justify-between rounded-xl bg-brand-50 p-3 font-medium">
                    🚗 {data.noCar} {data.noCar === 1 ? "trip has" : "trips have"} no car yet <span>›</span>
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>

        <Card title="Family settings">
          <ul className="divide-y divide-line/60">
            {[
              { href: "/family", icon: "👨‍👩‍👧", label: "Family, roles & invites" },
              { href: "/rules", icon: "🔒", label: "House rules" },
              { href: "/history", icon: "🕘", label: "History" },
              { href: "/places", icon: "⭐", label: "My places" },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-3 py-3 text-[15px]">
                  <span aria-hidden>{l.icon}</span>
                  <span className="flex-1">{l.label}</span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setShowCars(true)} className="flex w-full items-center gap-3 py-3 text-left text-[15px]">
                <span aria-hidden>🚗</span>
                <span className="flex-1">Cars ({ctx.cars.length})</span>
                <span className="text-muted">›</span>
              </button>
            </li>
          </ul>
        </Card>

        <Card title="Chores">
          {!data ? (
            <Skeleton />
          ) : kids.length === 0 ? (
            <Empty>Invite your children (Family, roles & invites) to give them chores.</Empty>
          ) : (
            <ul className="space-y-5">
              {kids.map((k) => {
                const mine = data.tasks.filter((t) => t.assigned_to === k.user_id);
                const open = mine.filter((t) => !t.completed_at);
                const points = data.tasks.filter((t) => t.completed_by === k.user_id).reduce((n, t) => n + t.points, 0);
                return (
                  <li key={k.user_id}>
                    <p className="mb-1 flex items-center gap-2 font-semibold">
                      <Avatar name={k.display_name} color={k.color} />
                      <span className="flex-1">{k.display_name}</span>
                      <span className="text-sm text-amber-600">★ {points}</span>
                    </p>
                    {open.length === 0 ? (
                      <p className="pl-8 text-sm text-muted">No open chores</p>
                    ) : (
                      <ul className="space-y-1 pl-8">
                        {open.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-[15px]">
                            <ActButton
                              run={async () => {
                                await toggleTask(ctx, t.id, false);
                                await reload();
                              }}
                              label="Mark done"
                              className="h-5 w-5 shrink-0 rounded border border-zinc-400"
                            >
                              {""}
                            </ActButton>
                            <span className={`flex-1 ${t.due_date && t.due_date < today ? "text-red-600" : ""}`}>{t.title}</span>
                            {t.due_date && <span className="text-xs text-muted">{t.due_date === today ? "Today" : formatDay(t.due_date)}</span>}
                            {t.points > 0 && <span className="text-xs text-amber-600">★ {t.points}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Give a chore">
          <ActionForm
            onSubmit={async (f) => {
              await addTask(ctx, f);
              await reload();
            }}
            submitLabel="Add chore"
          >
            <Field label="Chore">
              <Input name="title" required maxLength={200} placeholder="Feed the dog" />
            </Field>
            <Field label="For">
              <Select name="assigned_to" defaultValue={kids[0]?.user_id ?? ""}>
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
                <Input name="due_date" type="date" defaultValue={today} />
              </Field>
              <Field label="Points">
                <Input name="points" type="number" min={0} max={1000} defaultValue={5} />
              </Field>
            </div>
          </ActionForm>
          <div className="mt-4">
            <RewardsComingSoon />
          </div>
        </Card>
      </div>
      <CarsSheet open={showCars} onClose={() => setShowCars(false)} />
    </>
  );
}
