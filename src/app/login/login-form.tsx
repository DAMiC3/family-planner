"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signUp } from "@/app/actions/auth";
import { SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";

export function LoginForm() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction] = useActionState(signIn, {});
  const [upState, upAction] = useActionState(signUp, {});
  const linkError = useSearchParams().get("error") === "link";
  const state = mode === "in" ? inState : upState;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-6 grid grid-cols-2 rounded-lg bg-zinc-100 p-1 text-sm font-medium dark:bg-zinc-800">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-1.5 ${mode === m ? "bg-white shadow dark:bg-zinc-700" : "text-zinc-500"}`}
          >
            {m === "in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {mode === "up" && upState.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Check your email for a confirmation link, then come back and sign in.
        </p>
      ) : (
        <form action={mode === "in" ? inAction : upAction} className="flex flex-col gap-4">
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
          <SubmitButton>{mode === "in" ? "Sign in" : "Create account"}</SubmitButton>
          {(state.error || linkError) && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error ?? "That link has expired or was already used. Please sign in."}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
