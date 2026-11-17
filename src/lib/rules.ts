// Client-side mirror of `family_planner.can_write` so the app can explain restrictions
// and grey out buttons. The database is what actually enforces these rules.

import type { FamilyMember, MemberRole, MemberRule, RuleArea } from "@/lib/supabase/types";

export const AREAS: { value: RuleArea; label: string }[] = [
  { value: "everything", label: "Everything" },
  { value: "events", label: "Calendar events" },
  { value: "tasks", label: "Tasks" },
  { value: "shopping", label: "Shopping list" },
  { value: "meals", label: "Meals" },
  { value: "requests", label: "Activity requests" },
];

export const ROLES: { value: MemberRole; label: string }[] = [
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "other", label: "Other" },
];

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Current local date/time parts in the family's timezone. */
export function nowInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    dow: DAY_NAMES.indexOf(get("weekday")),
  };
}

export function ruleAppliesTo(rule: MemberRule, member: FamilyMember) {
  if (member.role === "parent") return false;
  if (rule.target_user) return rule.target_user === member.user_id;
  return rule.target_role === null || rule.target_role === member.role;
}

export function ruleActiveNow(rule: MemberRule, timeZone: string) {
  const now = nowInZone(timeZone);
  if (rule.days && rule.days.length && !rule.days.includes(now.dow)) return false;
  if (rule.start_date && now.date < rule.start_date) return false;
  if (rule.end_date && now.date > rule.end_date) return false;
  if (rule.start_time && rule.end_time) {
    const s = rule.start_time.slice(0, 5);
    const e = rule.end_time.slice(0, 5);
    const inWindow = s <= e ? now.time >= s && now.time < e : now.time >= s || now.time < e;
    if (!inWindow) return false;
  }
  return true;
}

/** The rule currently stopping `member` from changing `area`, if any. */
export function blockingRule(rules: MemberRule[], member: FamilyMember, area: RuleArea, timeZone: string) {
  return rules.find(
    (r) => (r.area === "everything" || r.area === area) && ruleAppliesTo(r, member) && ruleActiveNow(r, timeZone),
  );
}

export function describeRule(rule: MemberRule, members: FamilyMember[]) {
  const who = rule.target_user
    ? (members.find((m) => m.user_id === rule.target_user)?.display_name ?? "Former member")
    : rule.target_role === "child"
      ? "All children"
      : rule.target_role === "other"
        ? "Everyone with the Other role"
        : "All children and others";
  const what = AREAS.find((a) => a.value === rule.area)?.label.toLowerCase() ?? rule.area;
  const when: string[] = [];
  if (rule.days?.length) when.push(rule.days.length === 7 ? "every day" : rule.days.map((d) => DAY_NAMES[d]).join(", "));
  if (rule.start_time && rule.end_time) when.push(`${rule.start_time.slice(0, 5)}–${rule.end_time.slice(0, 5)}`);
  if (rule.start_date || rule.end_date)
    when.push(`${rule.start_date ? `from ${rule.start_date}` : ""}${rule.start_date && rule.end_date ? " " : ""}${rule.end_date ? `until ${rule.end_date}` : ""}`);
  return { who, what, when: when.length ? when.join(" · ") : "always" };
}
