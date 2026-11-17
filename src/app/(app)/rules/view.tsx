"use client";

import Link from "next/link";
import { ActButton, ActionForm } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Card, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { addRule, deleteRule } from "@/lib/planner";
import { AREAS, DAY_NAMES, describeRule, ruleActiveNow, ruleAppliesTo } from "@/lib/rules";

/** Parents set when children (or others) may not add or change things. */
export function RulesView() {
  const ctx = useFamily();
  const { rules, members, isParent, me, family } = ctx;
  const visible = isParent ? rules : rules.filter((r) => ruleAppliesTo(r, me));
  const nonParents = members.filter((m) => m.role !== "parent");

  return (
    <>
      <PageHeader
        title="House rules"
        subtitle={isParent ? "Pause adding and changing things for children or others — by person, area, day, time or dates." : "Rules your parents have set for you"}
      />
      <p className="mb-4 text-sm">
        <Link href="/family" className="text-brand-600">← Family</Link>
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title={`Rules (${visible.length})`}>
          {visible.length === 0 ? (
            <Empty>{isParent ? "No rules yet. Everyone can add and change things at any time." : "No rules apply to you."}</Empty>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {visible.map((r) => {
                const d = describeRule(r, members);
                const active = ruleActiveNow(r, family.timezone);
                return (
                  <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                    <span aria-hidden>{active ? "🔒" : "⏸️"}</span>
                    <div className="flex-1">
                      <p className="font-medium">
                        {d.who}: no changes to {d.what}
                      </p>
                      <p className="text-zinc-500">
                        {d.when}
                        {active ? " · active now" : ""}
                      </p>
                      {r.note && <p className="text-zinc-500">“{r.note}”</p>}
                    </div>
                    {isParent && (
                      <ActButton run={() => deleteRule(ctx, r.id)} label="Delete rule" className="px-1 text-zinc-400 hover:text-red-600">
                        ✕
                      </ActButton>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {isParent && (
          <Card title="Add a rule">
            <ActionForm onSubmit={(f) => addRule(ctx, f)} submitLabel="Add rule">
              <Field label="Who">
                <Select name="who" defaultValue="role:child">
                  <option value="role:child">All children</option>
                  <option value="role:other">Everyone with the Other role</option>
                  <option value="all">All children and others</option>
                  {nonParents.map((m) => (
                    <option key={m.user_id} value={`user:${m.user_id}`}>
                      Only {m.display_name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Can't add or change">
                <Select name="area" defaultValue="everything">
                  {AREAS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset className="text-sm">
                <legend className="mb-1 font-medium text-zinc-700">On these days (none = every day)</legend>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_NAMES.map((d, i) => (
                    <label key={d} className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2 py-1 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                      <input type="checkbox" name="days" value={i} className="sr-only" />
                      {d}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From time">
                  <Input name="start_time" type="time" />
                </Field>
                <Field label="To time">
                  <Input name="end_time" type="time" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From date">
                  <Input name="start_date" type="date" />
                </Field>
                <Field label="To date">
                  <Input name="end_date" type="date" />
                </Field>
              </div>
              <Field label="Note (shown to them)">
                <Input name="note" maxLength={200} placeholder="Homework time!" />
              </Field>
              <p className="text-xs text-zinc-500">
                Times use the family timezone ({family.timezone}). A window like 21:00–06:00 runs overnight. Parents are never restricted.
              </p>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
