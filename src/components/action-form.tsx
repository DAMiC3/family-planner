"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/form";

type Props = {
  onSubmit: (form: FormData) => Promise<void>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
};

/** A form that runs an async handler, shows errors and clears itself on success. */
export function ActionForm({ onSubmit, children, submitLabel, className, resetOnSuccess = true, successMessage }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await onSubmit(new FormData(e.currentTarget));
      if (resetOnSuccess) ref.current?.reset();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={ref} onSubmit={handle} className={className ?? "flex flex-col gap-3"}>
      {children}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {saved && successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
      </div>
    </form>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<"button"> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-500 active:scale-[0.98]",
    ghost: "text-ink underline-offset-2 hover:bg-zinc-100",
    danger: "text-red-600 hover:bg-red-50",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl px-5 py-3 text-[15px] font-semibold transition disabled:opacity-60 ${styles} ${className ?? ""}`}
    />
  );
}

/** Small icon-style button that runs an async action (toggle / delete). */
export function ActButton({
  run,
  label,
  children,
  className,
}: {
  run: () => Promise<void>;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={pending}
      className={`disabled:opacity-50 ${className ?? ""}`}
      onClick={async () => {
        setPending(true);
        try {
          await run();
        } catch (e) {
          alert(errorMessage(e));
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
    </button>
  );
}
