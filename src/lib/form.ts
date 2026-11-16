/** Input validation helpers. The database enforces the real rules (RLS, constraints); these give friendly messages. */

export class FieldError extends Error {}

export function str(form: FormData, key: string, maxLength = 500): string | null {
  const value = form.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new FieldError(`Too long (max ${maxLength} characters)`);
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
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new FieldError("Invalid selection");
  return value;
}

/** Throw a Supabase error as a normal Error. */
export function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
