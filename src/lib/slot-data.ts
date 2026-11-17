"use client";

import type { FamilyContextValue } from "@/components/family-provider";
import { check } from "@/lib/form";
import type { ActivityRequest, ActivityVote, CalendarEvent } from "@/lib/supabase/types";

/** Load requests + votes for the slots among `events`. */
export async function loadSlotExtras(ctx: FamilyContextValue, events: CalendarEvent[]) {
  const slotIds = events.filter((e) => e.kind === "slot").map((e) => e.id);
  if (!slotIds.length) return { requests: [] as ActivityRequest[], votes: [] as ActivityVote[] };
  const requests = await ctx.supabase.from("activity_requests").select("*").in("event_id", slotIds).order("created_at");
  check(requests.error);
  const ids = requests.data!.map((r) => r.id);
  const votes = ids.length
    ? await ctx.supabase.from("activity_votes").select("*").in("request_id", ids)
    : { data: [] as ActivityVote[], error: null };
  check(votes.error);
  return { requests: requests.data!, votes: votes.data! };
}
