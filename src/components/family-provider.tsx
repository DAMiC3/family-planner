"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/components/session-provider";
import { Skeleton } from "@/components/ui";
import { blockingRule } from "@/lib/rules";
import { channelName, getSupabase, type DB } from "@/lib/supabase/client";
import type { Car, Family, FamilyMember, MemberRule, RuleArea } from "@/lib/supabase/types";

export type FamilyContextValue = {
  supabase: DB;
  userId: string;
  email: string | null;
  family: Family;
  /** Me / members with display_name = nickname when set (use these for showing names). */
  me: FamilyMember;
  members: FamilyMember[];
  /** Unaltered rows (real name + nickname separately) for editing profiles. */
  rawMe: FamilyMember;
  rawMembers: FamilyMember[];
  rules: MemberRule[];
  cars: Car[];
  isParent: boolean;
  /** Parents, or someone a parent allowed to choose cars. */
  canAssignCars: boolean;
  /** The rule blocking me from changing `area` right now (UI hint; the database enforces it). */
  blockedBy: (area: RuleArea) => MemberRule | undefined;
  reloadFamily: () => Promise<void>;
};

type Loaded = Pick<FamilyContextValue, "supabase" | "userId" | "email" | "family" | "me" | "members" | "rules" | "cars">;

const FamilyContext = createContext<FamilyContextValue | null>(null);

/** Loads the signed-in user's family. Sends them to /login or /onboarding when needed. */
export function FamilyProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const [value, setValue] = useState<Loaded | null>(null);
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

    const [fam, mem, rules, cars] = await Promise.all([
      supabase.from("families").select("*").eq("id", membership.family_id).single(),
      supabase.from("family_members").select("*").eq("family_id", membership.family_id).order("joined_at"),
      supabase.from("member_rules").select("*").eq("family_id", membership.family_id).order("created_at"),
      supabase.from("cars").select("*").eq("family_id", membership.family_id).order("created_at"),
    ]);
    const err = fam.error ?? mem.error ?? rules.error ?? cars.error;
    if (err) return setError(err.message);
    setValue({
      supabase,
      userId,
      email: session.user.email ?? null,
      family: fam.data!,
      me: membership,
      members: mem.data!,
      rules: rules.data!,
      cars: cars.data!,
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

  // Keep members and rules fresh when a parent changes roles or rules.
  const familyId = value?.family.id;
  useEffect(() => {
    if (!familyId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(channelName(`family-meta-${familyId}`))
      .on("postgres_changes", { event: "*", schema: "family_planner", table: "member_rules", filter: `family_id=eq.${familyId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "family_planner", table: "family_members", filter: `family_id=eq.${familyId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "family_planner", table: "cars", filter: `family_id=eq.${familyId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId, load]);

  if (error) {
    return (
      <p role="alert" className="m-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
        Couldn&apos;t load your family: {error}
      </p>
    );
  }
  if (!value) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-6">
        <Skeleton />
      </div>
    );
  }

  const shown = (m: FamilyMember): FamilyMember => ({ ...m, display_name: m.nickname || m.display_name });
  const ctx: FamilyContextValue = {
    ...value,
    me: shown(value.me),
    members: value.members.map(shown),
    rawMe: value.me,
    rawMembers: value.members,
    isParent: value.me.role === "parent",
    canAssignCars: value.me.role === "parent" || value.me.can_assign_cars,
    blockedBy: (area) => blockingRule(value.rules, value.me, area, value.family.timezone),
    reloadFamily: load,
  };
  return (
    <FamilyContext.Provider value={ctx}>
      {value.me.family_confirmed === null ? <RealFamilyQuestion /> : children}
    </FamilyContext.Provider>
  );
}

export function useFamily(): FamilyContextValue {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error("useFamily must be used inside <FamilyProvider>");
  return ctx;
}

/** Asked once after joining: stay if it's your real family, leave straight away if not. */
function RealFamilyQuestion() {
  const ctx = useFamily();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(yes: boolean) {
    setBusy(true);
    setError(null);
    try {
      const q = ctx.supabase.from("family_members");
      const res = yes
        ? await q.update({ family_confirmed: true }).eq("family_id", ctx.family.id).eq("user_id", ctx.userId)
        : await q.delete().eq("family_id", ctx.family.id).eq("user_id", ctx.userId);
      if (res.error) throw new Error(res.error.message);
      if (yes) await ctx.reloadFamily();
      else router.replace("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-5 px-6 text-center">
      <p className="text-5xl" aria-hidden>
        🏡
      </p>
      <h1 className="text-2xl font-bold">Is {ctx.family.name} your real family?</h1>
      <p className="text-[15px] text-muted">
        You just joined. If this isn&apos;t your family, choose No and you&apos;ll leave it straight away.
      </p>
      <button type="button" disabled={busy} onClick={() => answer(true)} className="rounded-xl bg-brand-600 py-3.5 font-semibold text-white disabled:opacity-60">
        Yes, this is my family
      </button>
      <button type="button" disabled={busy} onClick={() => answer(false)} className="rounded-xl border border-line py-3.5 font-semibold disabled:opacity-60">
        No — leave this family
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
