"use client";

import type { FamilyContextValue } from "@/components/family-provider";
import { errorMessage } from "@/lib/form";
import { setDriver } from "@/lib/planner";
import type { CalendarEvent } from "@/lib/supabase/types";

/** Parents pick a driver; everyone else just sees who's driving. */
export function DriverSelect({ ctx, event, onDone }: { ctx: FamilyContextValue; event: CalendarEvent; onDone?: () => void }) {
  const driver = ctx.members.find((m) => m.user_id === event.driver_id);
  if (!ctx.isParent) {
    return driver ? (
      <span className="text-sm">🚗 {driver.display_name}</span>
    ) : (
      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Needs a driver</span>
    );
  }
  return (
    <select
      aria-label={`Driver for ${event.title}`}
      value={event.driver_id ?? ""}
      onChange={async (e) => {
        try {
          await setDriver(ctx, event.id, e.target.value || null);
          onDone?.();
        } catch (err) {
          alert(errorMessage(err));
        }
      }}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${event.driver_id ? "border-line bg-white" : "border-brand-600 bg-brand-50 text-brand-700"}`}
    >
      <option value="">🚗 Pick a driver</option>
      {ctx.members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          🚗 {m.display_name}
        </option>
      ))}
    </select>
  );
}
