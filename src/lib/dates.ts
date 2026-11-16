// Small timezone helpers so dates are shown and saved in the family's timezone,
// not the server's. No external date library needed.

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

function offsetMs(date: Date, timeZone: string) {
  const p = partsInZone(date, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-11-16T09:30" in `timeZone` → ISO string in UTC. */
export function zonedLocalToUtcIso(local: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local);
  if (!match) throw new Error("Invalid date");
  const [, y, m, d, h = "00", min = "00"] = match;
  const guess = Date.UTC(+y, +m - 1, +d, +h, +min);
  let utc = guess - offsetMs(new Date(guess), timeZone);
  utc = guess - offsetMs(new Date(utc), timeZone); // second pass handles DST edges
  return new Date(utc).toISOString();
}

/** Calendar date (YYYY-MM-DD) for an instant in `timeZone`. */
export function dateInZone(date: Date, timeZone: string): string {
  const p = partsInZone(date, timeZone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function todayInZone(timeZone: string): string {
  return dateInZone(new Date(), timeZone);
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `isoDate`. */
export function startOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(isoDate, dow === 0 ? -6 : 1 - dow);
}

export function formatDay(isoDate: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...opts,
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
