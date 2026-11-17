"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import type { FamilyContextValue } from "@/components/family-provider";
import { Field, Input, Select } from "@/components/ui";
import { addEvent } from "@/lib/planner";

/** Add an event, or (parents) an activity slot that everyone can send requests for. */
export function EventForm({ ctx, defaultDate, reload }: { ctx: FamilyContextValue; defaultDate: string; reload: () => Promise<void> }) {
  const [kind, setKind] = useState<"event" | "slot">("event");
  return (
    <ActionForm onSubmit={async (f) => { await addEvent(ctx, f); await reload(); }} submitLabel={kind === "slot" ? "Add slot" : "Add event"}>
      {ctx.isParent && (
        <div className="grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-800">
          {(["event", "slot"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-md py-1.5 ${kind === k ? "bg-white shadow dark:bg-zinc-700" : "text-zinc-500"}`}
            >
              {k === "event" ? "Event" : "✨ Activity slot"}
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="kind" value={kind} />
      {kind === "slot" && (
        <p className="text-xs text-zinc-500">Everyone can request what to do in this slot and vote. You choose the winner.</p>
      )}
      <Field label={kind === "slot" ? "Slot name" : "Title"}>
        <Input name="title" required maxLength={200} placeholder={kind === "slot" ? "Saturday afternoon fun" : "Swimming lesson"} />
      </Field>
      <Field label="Date">
        <Input name="date" type="date" defaultValue={defaultDate} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input name="start_time" type="time" />
        </Field>
        <Field label="Ends">
          <Input name="end_time" type="time" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="all_day" /> All day
      </label>
      {kind === "slot" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Requests close (date)">
            <Input name="close_date" type="date" />
          </Field>
          <Field label="at">
            <Input name="close_time" type="time" />
          </Field>
        </div>
      ) : (
        <>
          <Field label="Location">
            <Input name="location" maxLength={200} />
          </Field>
          <Field label="Who">
            <Select name="assigned_to" defaultValue="">
              <option value="">Everyone</option>
              {ctx.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
    </ActionForm>
  );
}
