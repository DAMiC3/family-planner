"use client";

import type { FamilyContextValue } from "@/components/family-provider";
import { check } from "@/lib/form";
import type { ActivityRequest, ActivityVote, CalendarEvent, EventInvite } from "@/lib/supabase/types";

/** Load requests + votes for the slots among `events`, and invites for all of them. */
export async function loadSlotExtras(ctx: FamilyContextValue, events: CalendarEvent[]) {
  const ids = events.map((e) => e.id);
  const slotIds = events.filter((e) => e.kind === "slot").map((e) => e.id);
  const [requests, invites] = await Promise.all([
    slotIds.length
      ? ctx.supabase.from("activity_requests").select("*").in("event_id", slotIds).order("created_at")
      : Promise.resolve({ data: [] as ActivityRequest[], error: null }),
    ids.length
      ? ctx.supabase.from("event_invites").select("*").in("event_id", ids)
      : Promise.resolve({ data: [] as EventInvite[], error: null }),
  ]);
  check(requests.error);
  check(invites.error);
  const reqIds = requests.data!.map((r) => r.id);
  const votes = reqIds.length
    ? await ctx.supabase.from("activity_votes").select("*").in("request_id", reqIds)
    : { data: [] as ActivityVote[], error: null };
  check(votes.error);
  return { requests: requests.data!, votes: votes.data!, invites: invites.data! };
}
