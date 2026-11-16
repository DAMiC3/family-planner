import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Family, FamilyMember } from "@/lib/supabase/types";

/** Signed-in user's id, or redirect to /login. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  return { supabase, userId, email: (data.claims.email as string | undefined) ?? null };
}

export type FamilyContext = Awaited<ReturnType<typeof requireFamily>>;

/**
 * The signed-in user's family (the first one they joined), its members and the
 * user's own membership. Redirects to /onboarding if they have no family yet.
 */
export async function requireFamily() {
  const { supabase, userId, email } = await requireUser();

  const { data: membership, error } = await supabase
    .from("family_members")
    .select("*")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!membership) redirect("/onboarding");

  const [{ data: family, error: famErr }, { data: members, error: memErr }] = await Promise.all([
    supabase.from("families").select("*").eq("id", membership.family_id).single(),
    supabase.from("family_members").select("*").eq("family_id", membership.family_id).order("joined_at"),
  ]);
  if (famErr) throw new Error(famErr.message);
  if (memErr) throw new Error(memErr.message);

  return {
    supabase,
    userId,
    email,
    family: family as Family,
    me: membership as FamilyMember,
    members: (members ?? []) as FamilyMember[],
  };
}

export function memberName(members: FamilyMember[], userId: string | null) {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId)?.display_name ?? null;
}
