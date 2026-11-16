"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fail, type ActionState } from "@/lib/form";

function credentials(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address" } as const;
  if (password.length < 8) return { error: "Password must be at least 8 characters" } as const;
  return { email, password } as const;
}

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = credentials(form);
  if ("error" in c) return fail(c.error!);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(c);
  if (error) return fail(error.message);
  redirect("/dashboard");
}

export async function signUp(_prev: ActionState, form: FormData): Promise<ActionState> {
  const c = credentials(form);
  if ("error" in c) return fail(c.error!);
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...c,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
  });
  if (error) return fail(error.message);
  if (data.session) redirect("/onboarding"); // email confirmation disabled
  return { ok: true, at: Date.now() };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
