"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { CarSelect } from "@/components/cars-sheet";
import { LocationPicker } from "@/components/location-picker";
import { Avatar, Field, Input, Select } from "@/components/ui";
import { dateInZone, formatDay, formatTime, todayInZone } from "@/lib/dates";
import { errorMessage } from "@/lib/form";
import { shortAddress, type Place } from "@/lib/geo";
import {
  addEvent,
  canDeleteEvent,
  canEditEvent,
  deleteEvent,
  respondToInvite,
  setEventStatus,
  updateEvent,
} from "@/lib/planner";
import { googleMapsPlaceUrl } from "@/lib/route";
import type { CalendarEvent, EventInvite } from "@/lib/supabase/types";

/** Collapsible section for the less common options. */
function More({ icon, title, children, open }: { icon: string; title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line/70 py-1 [&_summary::-webkit-details-marker]:hidden">
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

function placeOf(e: CalendarEvent): Place | null {
  if (e.lat == null || e.lng == null) return null;
  const [name, ...rest] = (e.location ?? "").split(" — ");
  return { name: name || "Location", address: rest.join(" — ") || e.location || name, lat: e.lat, lng: e.lng };
}

export function StatusBadge({ event }: { event: CalendarEvent }) {
  if (event.status === "pending")
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">⏳ WAITING FOR APPROVAL</span>;
  if (event.status === "declined")
    return <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-bold text-zinc-700">DECLINED</span>;
  return null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Present when editing / viewing an existing event. */
  event?: CalendarEvent | null;
  invites?: EventInvite[];
  /** Start a new event at this spot (e.g. a pin dropped on the map). */
  initialPlace?: Place | null;
};

/** Bottom sheet: add an event (from the + button) or open one to edit, approve, or answer an invite. */
export function EventSheet({ open, onClose, event, invites = [], initialPlace = null }: Props) {
  const ctx = useFamily();
  const tz = ctx.family.timezone;
  const today = todayInZone(tz);
  const [place, setPlace] = useState<Place | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSlot, setIsSlot] = useState(false);
  const blocked = ctx.blockedBy("events");
  const eventInvites = event ? invites.filter((i) => i.event_id === event.id) : [];
  const myInvite = eventInvites.find((i) => i.user_id === ctx.userId);
  const editable = event ? canEditEvent(ctx, event, invites) && !blocked : true;
  const owner = event ? ctx.members.find((m) => m.user_id === event.created_by) : ctx.me;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the sheet opens
    setPlace(event ? placeOf(event) : initialPlace);
    setIsSlot(event?.kind === "slot");
    setError(null);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, event, initialPlace]);

  if (!open) return null;

  async function run(fn: () => Promise<void>, close = true) {
    setPending(true);
    setError(null);
    try {
      await fn();
      if (close) onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(() => (event ? updateEvent(ctx, event, invites, form, place) : addEvent(ctx, form, place)));
  }

  const addBlocked = !event && !ctx.isParent && ctx.me.event_permission === "blocked";
  const needsApproval = !ctx.isParent && ctx.me.event_permission === "approval";
  const title = event ? (editable ? "Edit event" : "Event") : "Add to calendar";
  const invitable = ctx.members.filter((m) => m.user_id !== (event?.created_by ?? ctx.userId));
  const canChangeSharing = !event || ctx.isParent || event.created_by === ctx.userId;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <button type="button" onClick={onClose} className="text-ink" aria-label="Close">
            ✕
          </button>
          <h2 className="text-base font-semibold">{title}</h2>
          <span className="w-4" />
        </div>

        {/* Things anyone looking at the event may need to act on */}
        {event && (event.status !== "approved" || (myInvite && myInvite.status === "pending")) && (
          <div className="flex flex-col gap-2 border-b border-line/70 bg-zinc-50 px-5 py-3">
            {event.status !== "approved" && (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge event={event} />
                <span className="text-sm text-muted">Added by {owner?.display_name ?? "someone"}</span>
                {ctx.isParent && event.status === "pending" && (
                  <div className="ml-auto flex gap-2">
                    <Button className="px-4 py-2" disabled={pending} onClick={() => run(() => setEventStatus(ctx, event.id, "approved"))}>
                      Approve
                    </Button>
                    <Button variant="ghost" className="px-4 py-2" disabled={pending} onClick={() => run(() => setEventStatus(ctx, event.id, "declined"))}>
                      Decline
                    </Button>
                  </div>
                )}
              </div>
            )}
            {myInvite?.status === "pending" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium">📨 You&apos;re invited</span>
                <div className="ml-auto flex gap-2">
                  <Button className="px-4 py-2" disabled={pending} onClick={() => run(() => respondToInvite(ctx, event.id, "accepted"))}>
                    Accept
                  </Button>
                  <Button variant="ghost" className="px-4 py-2" disabled={pending} onClick={() => run(() => respondToInvite(ctx, event.id, "declined"))}>
                    Decline
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {!event && (blocked || addBlocked) ? (
          <p className="p-6 text-[15px]">
            🔒 {addBlocked ? "A parent has turned off adding events for you." : "A parent has paused adding to the calendar for you right now."}
            {blocked?.note ? ` “${blocked.note}”` : ""}
          </p>
        ) : event && !editable ? (
          <EventSummary event={event} invites={eventInvites} />
        ) : (
          <form key={event?.id ?? "new"} onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-5 pt-4">
              <div className="flex flex-col gap-4">
                {needsApproval && !event && (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">A parent will approve this before everyone sees it.</p>
                )}
                <Field label="What">
                  <Input name="title" required maxLength={200} placeholder="Soccer practice" defaultValue={event?.title} autoFocus={!event} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date">
                    <Input name="date" type="date" required defaultValue={event ? dateInZone(new Date(event.starts_at), tz) : today} />
                  </Field>
                  <Field label="Time">
                    <Input name="start_time" type="time" defaultValue={event && !event.all_day ? formatTime(event.starts_at, tz) : undefined} />
                  </Field>
                </div>
                <LocationPicker value={place} onChange={setPlace} />
              </div>

              <div className="mt-4 border-t border-line/70">
                {!isSlot && (
                  <More icon="👤" title="Who's it for">
                    <Select name="assigned_to" defaultValue={event?.assigned_to ?? ""}>
                      <option value="">Everyone</option>
                      {ctx.members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name}
                        </option>
                      ))}
                    </Select>
                  </More>
                )}
                {!isSlot && (
                  <More icon="👥" title={`Invite people${eventInvites.length ? ` (${eventInvites.length})` : ""}`}>
                    <div className="flex flex-col gap-2">
                      {invitable.map((m) => {
                        const inv = eventInvites.find((i) => i.user_id === m.user_id);
                        return (
                          <label key={m.user_id} className="flex items-center gap-3 text-[15px]">
                            <input type="checkbox" name="invitees" value={m.user_id} defaultChecked={Boolean(inv)} className="h-5 w-5 accent-brand-600" />
                            <Avatar name={m.display_name} color={m.color} />
                            <span className="flex-1">{m.display_name}</span>
                            {inv && <span className="text-xs text-muted">{inv.status}</span>}
                          </label>
                        );
                      })}
                    </div>
                    {canChangeSharing && (
                      <Select name="invitees_can_edit" defaultValue={event && !event.invitees_can_edit ? "false" : "true"} aria-label="What invitees can do">
                        <option value="true">Invitees who accept can change it (shared)</option>
                        <option value="false">Invitees can only view it</option>
                      </Select>
                    )}
                  </More>
                )}
                {!isSlot && (
                  <More icon="🚗" title="Drop-off, pick-up & car">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Be there by">
                        <Input name="arrive_time" type="time" defaultValue={event?.arrive_by ? formatTime(event.arrive_by, tz) : undefined} />
                      </Field>
                      <Field label="Pick up at">
                        <Input name="pickup_time" type="time" defaultValue={event?.pickup_at ? formatTime(event.pickup_at, tz) : undefined} />
                      </Field>
                    </div>
                    <p className="-mt-1 text-xs text-muted">Empty “be there by” = the start time. Leave “pick up” empty if nobody needs collecting.</p>
                    {ctx.canAssignCars && (
                      <Field label="Car">
                        <CarSelect name="car_id" value={event?.car_id} />
                      </Field>
                    )}
                    {ctx.isParent && (
                      <Field label="Driver">
                        <Select name="driver_id" defaultValue={event?.driver_id ?? ""}>
                          <option value="">No driver yet</option>
                          {ctx.members.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.display_name} ({m.role})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                  </More>
                )}
                <More icon="⏰" title="End time / all day">
                  <Field label="Ends">
                    <Input name="end_time" type="time" defaultValue={event?.ends_at ? formatTime(event.ends_at, tz) : undefined} />
                  </Field>
                  <label className="flex items-center gap-2 text-[15px]">
                    <input type="checkbox" name="all_day" defaultChecked={event?.all_day && !!event} className="h-5 w-5 accent-brand-600" /> All day
                  </label>
                </More>
                <More icon="📝" title="Notes">
                  <textarea
                    name="description"
                    maxLength={2000}
                    rows={3}
                    defaultValue={event?.description ?? ""}
                    className="w-full rounded-xl border border-line px-3.5 py-3 focus:border-ink focus:outline-none"
                    placeholder="Bring shin guards"
                  />
                </More>
                {ctx.isParent && !event && (
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
                {event && (
                  <p className="py-3 text-sm text-muted">
                    Added by {owner?.display_name ?? "a former member"}
                    {needsApproval && event.status === "approved" ? " · changes need a parent's approval again" : ""}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-line/70 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {event && canDeleteEvent(ctx, event) && (
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Delete "${event.title}"?`)) void run(() => deleteEvent(ctx, event.id));
                  }}
                >
                  Delete
                </Button>
              )}
              <Button type="submit" disabled={pending} className="flex-1">
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="px-5 pb-4 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Read-only view for people who can't change the event. */
function EventSummary({ event, invites }: { event: CalendarEvent; invites: EventInvite[] }) {
  const ctx = useFamily();
  const tz = ctx.family.timezone;
  const name = (id: string | null) => ctx.members.find((m) => m.user_id === id)?.display_name;
  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[15px]">
      <h3 className="text-xl font-semibold">{event.title}</h3>
      <p>
        🗓️ {formatDay(dateInZone(new Date(event.starts_at), tz), { weekday: "long" })}
        {event.all_day ? " · all day" : ` · ${formatTime(event.starts_at, tz)}${event.ends_at ? `–${formatTime(event.ends_at, tz)}` : ""}`}
      </p>
      {event.location && <p>📍 {shortAddress(event.location)}</p>}
      <p>👤 {name(event.assigned_to) ?? "Everyone"}</p>
      {event.arrive_by && <p>⏱️ Be there by {formatTime(event.arrive_by, tz)}</p>}
      {event.pickup_at && <p>↩️ Pick up at {formatTime(event.pickup_at, tz)}</p>}
      {event.lat != null && (
        <p>
          🚗 {ctx.cars.find((c) => c.id === event.car_id)?.name ?? "No car yet"} · {name(event.driver_id) ?? "no driver yet"}
        </p>
      )}
      {event.lat != null && (
        <a href={googleMapsPlaceUrl({ lat: event.lat, lng: event.lng! })} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
          Open in Google Maps
        </a>
      )}
      {invites.length > 0 && (
        <p>
          👥 {invites.map((i) => `${name(i.user_id) ?? "?"} (${i.status})`).join(", ")}
          {!event.invitees_can_edit && " · view only"}
        </p>
      )}
      {event.description && <p className="whitespace-pre-wrap text-muted">📝 {event.description}</p>}
      <p className="text-sm text-muted">Added by {name(event.created_by) ?? "a former member"} · only they{event.invitees_can_edit ? ", people who accepted an invite" : ""} and parents can change it.</p>
    </div>
  );
}
