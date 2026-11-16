export type ActionState = { error?: string; ok?: boolean; at?: number };

export const ok = (): ActionState => ({ ok: true, at: Date.now() });
export const fail = (error: string): ActionState => ({ error, at: Date.now() });

/** Read a trimmed string field; returns null when empty. */
export function str(form: FormData, key: string, maxLength = 500): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new FieldError(`${key} is too long (max ${maxLength} characters)`);
  return trimmed;
}

export function requiredStr(form: FormData, key: string, label: string, maxLength = 200): string {
  const value = str(form, key, maxLength);
  if (!value) throw new FieldError(`${label} is required`);
  return value;
}

export function isoDate(form: FormData, key: string): string | null {
  const value = str(form, key, 10);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FieldError("Invalid date");
  return value;
}

export function uuid(form: FormData, key: string): string | null {
  const value = str(form, key, 36);
  if (!value) return null;
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new FieldError("Invalid id");
  return value;
}

export class FieldError extends Error {}

/** Wrap an action body: FieldErrors and Supabase errors become a friendly message. */
export async function handle(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return ok();
  } catch (e) {
    if (e instanceof FieldError) return fail(e.message);
    // Let Next.js control-flow errors (redirect, notFound) propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return fail(e instanceof Error ? e.message : "Something went wrong");
  }
}
