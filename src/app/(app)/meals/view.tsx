"use client";

import { useState } from "react";
import { ActButton, ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Card, Field, Input, PageHeader, RestrictedNotice, Select, Skeleton } from "@/components/ui";
import { addDays, formatDay, startOfWeek, todayInZone } from "@/lib/dates";
import { check } from "@/lib/form";
import { MEAL_TYPES, addMeal, deleteMeal } from "@/lib/planner";
import { useFamilyQuery } from "@/lib/use-family-query";

export function MealsView() {
  const ctx = useFamily();
  const { family } = ctx;
  const today = todayInZone(family.timezone);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data, error, reload } = useFamilyQuery(
    async ({ supabase }) => {
      const res = await supabase
        .from("meals")
        .select("*")
        .eq("family_id", family.id)
        .gte("date", weekStart)
        .lte("date", addDays(weekStart, 6))
        .order("created_at");
      check(res.error);
      return res.data!;
    },
    [weekStart],
    ["meals"],
  );

  return (
    <>
      <PageHeader title="Meal plan" subtitle="Plan the week's food" />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card
          title={`Week of ${formatDay(weekStart, { weekday: undefined })}`}
          action={
            <div className="flex gap-1 text-sm">
              <Button variant="ghost" className="px-2 py-1" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</Button>
              <Button variant="ghost" className="px-2 py-1" onClick={() => setWeekStart(startOfWeek(today))}>Today</Button>
              <Button variant="ghost" className="px-2 py-1" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</Button>
            </div>
          }
        >
          {!data ? (
            <Skeleton />
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {days.map((day) => {
                const meals = data
                  .filter((m) => m.date === day)
                  .sort((a, b) => MEAL_TYPES.indexOf(a.meal_type) - MEAL_TYPES.indexOf(b.meal_type));
                return (
                  <div key={day} className={`flex gap-4 py-3 ${day === today ? "rounded-lg bg-indigo-50 px-2 dark:bg-indigo-950/40" : ""}`}>
                    <span className="w-24 shrink-0 text-sm font-medium">{formatDay(day)}</span>
                    <ul className="flex-1 space-y-1 text-sm">
                      {meals.length === 0 && <li className="text-zinc-400">—</li>}
                      {meals.map((m) => (
                        <li key={m.id} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 capitalize text-zinc-500">{m.meal_type}</span>
                          <span className="flex-1">{m.title}</span>
                          <ActButton run={async () => { await deleteMeal(ctx, m.id); await reload(); }} label="Remove meal" className="px-1 text-zinc-400 hover:text-red-600">
                            ✕
                          </ActButton>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Add meal">
          <RestrictedNotice rule={ctx.blockedBy("meals")} what="meals" />
          {!ctx.blockedBy("meals") && <ActionForm onSubmit={async (f) => { await addMeal(ctx, f); await reload(); }} submitLabel="Add meal" key={weekStart}>
            <Field label="Meal">
              <Input name="title" required maxLength={200} placeholder="Spaghetti bolognese" />
            </Field>
            <Field label="Day">
              <Select name="date" defaultValue={days.includes(today) ? today : days[0]}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="meal_type" defaultValue="dinner">
                {MEAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
          </ActionForm>}
        </Card>
      </div>
    </>
  );
}
