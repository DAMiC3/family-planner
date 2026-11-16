import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { addMeal, deleteMeal } from "@/app/actions/planner";
import { ActionForm } from "@/components/action-form";
import { Card, Field, IdButton, Input, PageHeader, Select, Skeleton } from "@/components/ui";
import { requireFamily } from "@/lib/family";
import { addDays, formatDay, startOfWeek, todayInZone } from "@/lib/dates";
import type { MealType } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Meals" };

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export default function MealsPage({ searchParams }: PageProps<"/meals">) {
  return (
    <>
      <PageHeader title="Meal plan" subtitle="Plan the week's food" />
      <Suspense fallback={<Skeleton />}>
        <Meals searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Meals({ searchParams }: { searchParams: PageProps<"/meals">["searchParams"] }) {
  const { supabase, family } = await requireFamily();
  const today = todayInZone(family.timezone);
  const weekParam = (await searchParams).week;
  const requested = typeof weekParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today;
  const weekStart = startOfWeek(requested);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .eq("family_id", family.id)
    .gte("date", days[0])
    .lte("date", days[6])
    .order("created_at");
  if (error) throw new Error(error.message);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card
        title={`Week of ${formatDay(weekStart, { weekday: undefined })}`}
        action={
          <div className="flex gap-3 text-sm">
            <Link href={`/meals?week=${addDays(weekStart, -7)}`} className="text-indigo-600">← Prev</Link>
            <Link href="/meals" className="text-indigo-600">This week</Link>
            <Link href={`/meals?week=${addDays(weekStart, 7)}`} className="text-indigo-600">Next →</Link>
          </div>
        }
      >
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
                      <IdButton action={deleteMeal} id={m.id} label="Remove meal" className="text-zinc-400 hover:text-red-600">
                        ✕
                      </IdButton>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Add meal">
        <ActionForm action={addMeal} submitLabel="Add meal">
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
                <option key={t} value={t} className="capitalize">
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
