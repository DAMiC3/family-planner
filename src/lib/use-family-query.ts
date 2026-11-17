"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFamily, type FamilyContextValue } from "@/components/family-provider";
import { channelName } from "@/lib/supabase/client";

type LiveTable = "events" | "tasks" | "shopping_items" | "meals" | "activity_requests" | "activity_votes";

/**
 * Runs `query` for the current family and re-runs it whenever `deps` change or
 * another family member changes one of `liveTables` (Supabase Realtime), so
 * everyone's screen stays in sync.
 */
export function useFamilyQuery<T>(
  query: (ctx: FamilyContextValue) => Promise<T>,
  deps: unknown[],
  liveTables: LiveTable[] = [],
) {
  const ctx = useFamily();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Always call the latest query/context without re-subscribing on every render.
  const latest = useRef({ query, ctx });
  useEffect(() => {
    latest.current = { query, ctx };
  });

  const familyId = ctx.family.id;
  const depsKey = JSON.stringify(deps);

  const reload = useCallback(async () => {
    try {
      setData(await latest.current.query(latest.current.ctx));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, familyId, depsKey]);

  // Changes made from the + sheet (outside this page) refresh the page right away.
  useEffect(() => {
    const onChange = () => void reload();
    window.addEventListener("planner:changed", onChange);
    return () => window.removeEventListener("planner:changed", onChange);
  }, [reload]);

  const supabase = ctx.supabase;
  const tablesKey = liveTables.join(",");
  useEffect(() => {
    if (!tablesKey) return;
    const channel = supabase.channel(channelName(`family-${familyId}-${tablesKey}`));
    for (const table of tablesKey.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "family_planner", table, filter: `family_id=eq.${familyId}` },
        () => void reload(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, familyId, tablesKey, reload]);

  return { data, error, reload };
}
