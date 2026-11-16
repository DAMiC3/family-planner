"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/action-form";
import { useSession } from "@/components/session-provider";
import { Field, Input } from "@/components/ui";
import { withBase } from "@/lib/base-path";
import { getSupabase } from "@/lib/supabase/client";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");

    setPending(true);
    const supabase = getSupabase();
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError(error.message);
        router.replace("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${withBase("/onboarding/")}` },
        });
        if (error) return setError(error.message);
        if (data.session) router.replace("/onboarding");
        else setCheckEmail(true);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-800">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-md py-1.5 ${mode === m ? "bg-white shadow dark:bg-zinc-700" : "text-zinc-500"}`}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {checkEmail ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Check your email for a confirmation link. It will bring you back here to set up your family.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              minLength={8}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
