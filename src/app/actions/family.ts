"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireFamily, requireUser } from "@/lib/family";
import { FieldError, handle, requiredStr, str, type ActionState } from "@/lib/form";
import { isValidTimeZone } from "@/lib/dates";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function createFamily(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const { supabase } = await requireUser();
    const name = requiredStr(form, "name", "Family name", 80);
    const displayName = requiredStr(form, "display_name", "Your name", 50);
    const tz = str(form, "timezone", 64);

    const { data: family, error } = await supabase.rpc("create_family", {
      p_name: name,
      p_display_name: displayName,
    });
    if (error) throw new Error(error.message);
    if (tz && isValidTimeZone(tz)) {
      await supabase.from("families").update({ name, timezone: tz }).eq("id", family.id);
    }
  });
  if (result.error) return result;
  redirect("/dashboard");
}

export async function joinFamily(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const { supabase } = await requireUser();
    const code = requiredStr(form, "invite_code", "Invite code", 20);
    const displayName = requiredStr(form, "display_name", "Your name", 50);
    const { error } = await supabase.rpc("join_family", { p_invite_code: code, p_display_name: displayName });
    if (error) throw new FieldError(error.message.includes("invalid invite") ? "That invite code didn't work" : error.message);
  });
  if (result.error) return result;
  redirect("/dashboard");
}

export async function updateMyProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const { supabase, userId, family } = await requireFamily();
    const displayName = requiredStr(form, "display_name", "Name", 50);
    const color = str(form, "color", 7) ?? "#6366f1";
    if (!COLOR_RE.test(color)) throw new FieldError("Pick a valid colour");
    const { error } = await supabase
      .from("family_members")
      .update({ display_name: displayName, color })
      .eq("family_id", family.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function updateFamily(_prev: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const { supabase, family, me } = await requireFamily();
    if (me.role !== "owner") throw new FieldError("Only the family owner can do this");
    const name = requiredStr(form, "name", "Family name", 80);
    const tz = requiredStr(form, "timezone", "Timezone", 64);
    if (!isValidTimeZone(tz)) throw new FieldError("Unknown timezone");
    const { error } = await supabase.from("families").update({ name, timezone: tz }).eq("id", family.id);
    if (error) throw new Error(error.message);
    refresh();
  });
}

export async function regenerateInviteCode() {
  const { supabase, family } = await requireFamily();
  const { error } = await supabase.rpc("regenerate_invite_code", { p_family_id: family.id });
  if (error) throw new Error(error.message);
  refresh();
}

export async function leaveFamily() {
  const { supabase, family, userId } = await requireFamily();
  const { error } = await supabase.from("family_members").delete().eq("family_id", family.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  redirect("/onboarding");
}
