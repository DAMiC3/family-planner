"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/form";

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
};

/** A form wired to a Server Action that shows errors and clears itself on success. */
export function ActionForm({ action, children, submitLabel, className, resetOnSuccess = true, successMessage }: Props) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state.at, state.ok, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className ?? "flex flex-col gap-3"}>
      {children}
      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        {state.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.ok && successMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{successMessage}</p>}
      </div>
    </form>
  );
}

export function SubmitButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-500",
    ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
    danger: "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${styles}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}
