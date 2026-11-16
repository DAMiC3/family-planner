"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/components/session-provider";
import { Skeleton } from "@/components/ui";
import { getSupabase, type DB } from "@/lib/supabase/client";
import type { Family, FamilyMember } from "@/lib/supabase/types";

export type FamilyContextValue = {
  supabase: DB;
  userId: string;
  email: string | null;
  family: Family;
  me: FamilyMember;
  members: FamilyMember[];
  reloadFamily: () => Promise<void>;
};

const FamilyContext = createContext<FamilyContextValue | null>(null);

/** Loads the signed-in user's family. Sends them to /login or /onboarding when needed. */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const [value, setValue] = useState<Omit<FamilyContextValue, "reloadFamily"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const supabase = getSupabase();
    const userId = session.user.id;
    const { data: membership, error: mErr } = await supabase
      .from("family_members")
      .select("*")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mErr) return setError(mErr.message);
    if (!membership) return router.replace("/onboarding");

    const [fam, mem] = await Promise.all([
      supabase.from("families").select("*").eq("id", membership.family_id).single(),
      supabase.from("family_members").select("*").eq("family_id", membership.family_id).order("joined_at"),
    ]);
    if (fam.error || mem.error) return setError((fam.error ?? mem.error)!.message);
    setValue({
      supabase,
      userId,
      email: session.user.email ?? null,
      family: fam.data,
      me: membership,
      members: mem.data,
    });
  }, [session, router]);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data from Supabase
    void load();
  }, [loading, session, load, router]);

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        Couldn&apos;t load your family: {error}
      </p>
    );
  }
  if (!value) return <Skeleton />;

  return <FamilyContext.Provider value={{ ...value, reloadFamily: load }}>{children}</FamilyContext.Provider>;
}

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily must be used inside <FamilyProvider>");
  return ctx;
}
