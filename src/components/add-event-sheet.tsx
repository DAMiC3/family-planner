"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { LocationPicker } from "@/components/location-picker";
import { Field, Input, Select } from "@/components/ui";
import { todayInZone } from "@/lib/dates";
import { errorMessage } from "@/lib/form";
import type { Place } from "@/lib/geo";
import { addEvent } from "@/lib/planner";

/** Collapsible section for the less common options. */
function More({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <details className="group border-b border-line/70 py-1 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 py-3 font-medium">
        <span aria-hidden>{icon}</span>
        <span className="flex-1">{title}</span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden>
          ⌄
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-4">{children}</div>
    </details>
  );
}

/** Bottom sheet opened by the + button: add something to the family calendar from any tab. */
export function AddEventSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ctx = useFamily();
  const today = todayInZone(ctx.family.timezone);
  const [place, setPlace] = useState<Place | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSlot, setIsSlot] = useState(false);
  const blocked = ctx.blockedBy("events");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await addEvent(ctx, form, place);
      setPlace(null);
      setIsSlot(false);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const others = ctx.members;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Add to calendar">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <button type="button" onClick={onClose} className="text-ink" aria-label="Close">
            ✕
          </button>
          <h2 className="text-base font-semibold">Add to calendar</h2>
          <span className="w-4" />
        </div>

        {blocked ? (
          <p className="p-6 text-[15px]">🔒 A parent has paused adding to the calendar for you right now.{blocked.note ? ` “${blocked.note}”` : ""}</p>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 pt-4">
              <div className="flex flex-col gap-4">
                <Field label="What">
                  <Input name="title" required maxLength={200} placeholder="Soccer practice" autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date">
                    <Input name="date" type="date" defaultValue={today} required />
                  </Field>
                  <Field label="Time">
                    <Input name="start_time" type="time" />
                  </Field>
                </div>
                <LocationPicker value={place} onChange={setPlace} />
              </div>

              <div className="mt-4 border-t border-line/70">
                <More icon="👤" title="Who's it for">
                  <Select name="assigned_to" defaultValue="">
                    <option value="">Everyone</option>
                    {others.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </option>
                    ))}
                  </Select>
                </More>
                {ctx.isParent && (
                  <More icon="🚗" title="Driver">
                    <Select name="driver_id" defaultValue="">
                      <option value="">No driver yet</option>
                      {others.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name} ({m.role})
                        </option>
                      ))}
                    </Select>
                  </More>
                )}
                <More icon="⏰" title="End time / all day">
                  <Field label="Ends">
                    <Input name="end_time" type="time" />
                  </Field>
                  <label className="flex items-center gap-2 text-[15px]">
                    <input type="checkbox" name="all_day" className="h-5 w-5 accent-brand-600" /> All day
                  </label>
                </More>
                <More icon="📝" title="Notes">
                  <textarea
                    name="description"
                    maxLength={2000}
                    rows={3}
                    className="w-full rounded-xl border border-line px-3.5 py-3 focus:border-ink focus:outline-none"
                    placeholder="Bring shin guards"
                  />
                </More>
                {ctx.isParent && (
                  <More icon="✨" title="Make it an activity slot">
                    <label className="flex items-center gap-2 text-[15px]">
                      <input
                        type="checkbox"
                        name="kind"
                        value="slot"
                        checked={isSlot}
                        onChange={(e) => setIsSlot(e.target.checked)}
                        className="h-5 w-5 accent-brand-600"
                      />
                      Let everyone request what to do
                    </label>
                    {isSlot && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Requests close">
                          <Input name="close_date" type="date" />
                        </Field>
                        <Field label="at">
                          <Input name="close_time" type="time" />
                        </Field>
                      </div>
                    )}
                  </More>
                )}
              </div>
            </div>

            <div className="border-t border-line/70 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {error && (
                <p role="alert" className="mb-2 text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
