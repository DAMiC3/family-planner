"use client";

import { ActButton, ActionForm } from "@/components/action-form";
import type { FamilyContextValue } from "@/components/family-provider";
import { Avatar, Input } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { addRequest, chooseRequest, deleteEvent, deleteRequest, toggleVote } from "@/lib/planner";
import type { ActivityRequest, ActivityVote, CalendarEvent } from "@/lib/supabase/types";

/** An activity slot: parents set the time, everyone suggests what to do and votes, a parent decides. */
export function SlotCard({
  slot,
  requests,
  votes,
  ctx,
  reload,
}: {
  slot: CalendarEvent;
  requests: ActivityRequest[];
  votes: ActivityVote[];
  ctx: FamilyContextValue;
  reload: () => Promise<void>;
}) {
  const tz = ctx.family.timezone;
  const memberById = new Map(ctx.members.map((m) => [m.user_id, m]));
  const closed =
    Boolean(slot.chosen_request_id) || (slot.requests_close_at !== null && new Date(slot.requests_close_at) < new Date());
  const blocked = ctx.blockedBy("requests");
  const canRequest = !closed && !blocked;
  const chosen = requests.find((r) => r.id === slot.chosen_request_id);
  const sorted = [...requests].sort(
    (a, b) => votes.filter((v) => v.request_id === b.id).length - votes.filter((v) => v.request_id === a.id).length,
  );

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
      <div className="flex items-start gap-2">
        <span aria-hidden>✨</span>
        <div className="flex-1">
          <p className="font-semibold">{slot.title}</p>
          <p className="text-xs text-zinc-500">
            Activity slot · {slot.all_day ? "all day" : formatTime(slot.starts_at, tz)}
            {slot.ends_at && !slot.all_day ? `–${formatTime(slot.ends_at, tz)}` : ""}
            {slot.requests_close_at && !slot.chosen_request_id
              ? ` · requests close ${new Date(slot.requests_close_at).toLocaleString("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
        </div>
        {ctx.isParent && (
          <ActButton
            run={async () => {
              if (confirm(`Delete the slot "${slot.title}"?`)) {
                await deleteEvent(ctx, slot.id);
                await reload();
              }
            }}
            label="Delete slot"
            className="px-1 text-zinc-400 hover:text-red-600"
          >
            ✕
          </ActButton>
        )}
      </div>

      {chosen && (
        <p className="mt-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          ✅ Plan: {chosen.title}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {sorted.map((r) => {
          const who = memberById.get(r.requested_by);
          const count = votes.filter((v) => v.request_id === r.id).length;
          const mine = votes.some((v) => v.request_id === r.id && v.user_id === ctx.userId);
          const isChosen = r.id === slot.chosen_request_id;
          return (
            <li key={r.id} className={`flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm dark:bg-zinc-900 ${isChosen ? "ring-2 ring-emerald-500" : ""}`}>
              {who && <Avatar name={who.display_name} color={who.color} />}
              <span className="flex-1">{r.title}</span>
              <ActButton
                run={async () => { await toggleVote(ctx, r.id, mine); await reload(); }}
                label={mine ? "Remove my vote" : "Vote for this"}
                className={`rounded-full px-2 py-0.5 text-xs ${mine ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
              >
                👍 {count}
              </ActButton>
              {ctx.isParent && (
                <ActButton
                  run={async () => { await chooseRequest(ctx, slot.id, isChosen ? null : r.id); await reload(); }}
                  label={isChosen ? "Undo choice" : "Choose this"}
                  className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-500"
                >
                  {isChosen ? "Undo" : "Choose"}
                </ActButton>
              )}
              {(ctx.isParent || r.requested_by === ctx.userId) && (
                <ActButton
                  run={async () => { await deleteRequest(ctx, r.id); await reload(); }}
                  label="Remove request"
                  className="px-1 text-zinc-400 hover:text-red-600"
                >
                  ✕
                </ActButton>
              )}
            </li>
          );
        })}
        {requests.length === 0 && <li className="text-sm text-zinc-500">No ideas yet — be the first!</li>}
      </ul>

      {canRequest ? (
        <ActionForm
          onSubmit={async (f) => { await addRequest(ctx, slot.id, f); await reload(); }}
          submitLabel="Request"
          className="mt-3 flex gap-2"
        >
          <Input name="title" required maxLength={200} placeholder="What should we do?" aria-label="Your request" className="min-w-0 flex-1" />
        </ActionForm>
      ) : (
        !slot.chosen_request_id && (
          <p className="mt-3 text-xs text-zinc-500">{blocked ? "🔒 Requests are paused for you right now." : "Requests are closed."}</p>
        )
      )}
    </div>
  );
}
