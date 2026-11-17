import type { ComponentProps, ReactNode } from "react";

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-3 text-base text-ink placeholder:text-muted focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm font-semibold text-ink ${className ?? ""}`}>
      {label}
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/70 bg-white p-5 shadow-[0_6px_16px_rgba(0,0,0,0.08)]">
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
    </header>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[15px] text-muted">{children}</p>;
}

export function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 rounded bg-zinc-200" />
      <div className="h-40 rounded-2xl bg-zinc-200" />
      <div className="h-40 rounded-2xl bg-zinc-200" />
    </div>
  );
}

export function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
      title={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Explains that a parent's rule is stopping you from changing this right now. */
export function RestrictedNotice({ rule, what }: { rule: { note: string | null; end_time: string | null } | undefined; what: string }) {
  if (!rule) return null;
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      🔒 A parent has paused {what} for you right now
      {rule.end_time ? ` (until ${rule.end_time.slice(0, 5)})` : ""}.{rule.note ? ` “${rule.note}”` : ""}
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    parent: "bg-brand-100 text-brand-700",
    child: "bg-emerald-100 text-emerald-700",
    other: "bg-zinc-100 text-zinc-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[role] ?? styles.other}`}>{role}</span>;
}
