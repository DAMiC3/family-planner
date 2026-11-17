"use client";

import { useState } from "react";
import { Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Avatar, Card, Empty, PageHeader, Skeleton } from "@/components/ui";
import { check } from "@/lib/form";
import type { ChangeLogRow } from "@/lib/supabase/types";
import { useFamilyQuery } from "@/lib/use-family-query";

const THING: Record<string, string> = {
  events: "event",
  tasks: "task",
  meals: "meal",
  shopping_items: "shopping item",
  family_members: "member",
  member_rules: "house rule",
  activity_requests: "activity request",
  invites: "invite",
  families: "family settings",
};

const FIELD: Record<string, string> = {
  title: "title",
  name: "name",
  starts_at: "start",
  ends_at: "end",
  all_day: "all day",
  location: "place",
  description: "notes",
  notes: "notes",
  assigned_to: "for",
  driver_id: "driver",
  completed_at: "done",
  completed_by: "done by",
  due_date: "due",
  points: "points",
  checked: "ticked",
  quantity: "quantity",
  checkers_url: "Checkers link",
  meal_type: "meal",
  date: "date",
  role: "role",
  display_name: "name",
  color: "colour",
  timezone: "timezone",
  invite_code: "family code",
  chosen_request_id: "chosen idea",
  requests_close_at: "requests close",
  kind: "type",
  area: "area",
  days: "days",
  start_time: "from",
  end_time: "to",
  start_date: "from date",
  end_date: "to date",
  target_user: "person",
  target_role: "role",
  note: "note",
  email: "email",
};
const HIDDEN = new Set(["id", "family_id", "created_at", "updated_at", "lat", "lng", "created_by", "added_by", "list_id", "event_id", "requested_by", "invited_by", "user_id", "joined_at", "accepted_at"]);
const PEOPLE = new Set(["assigned_to", "driver_id", "completed_by", "target_user"]);

function label(row: ChangeLogRow) {
  const d = (row.new_data ?? row.old_data ?? {}) as Record<string, unknown>;
  return String(d.title ?? d.name ?? d.display_name ?? d.email ?? "");
}

export function HistoryView() {
  const ctx = useFamily();
  const { family, members, isParent } = ctx;
  const [limit, setLimit] = useState(100);
  const tz = family.timezone;

  const { data, error } = useFamilyQuery(
    async ({ supabase }) => {
      const res = await supabase
        .from("change_log")
        .select("*")
        .eq("family_id", family.id)
        .order("changed_at", { ascending: false })
        .limit(limit);
      check(res.error);
      return res.data!;
    },
    [limit],
    ["events", "tasks", "meals", "shopping_items"],
  );

  if (!isParent) {
    return (
      <>
        <PageHeader title="History" />
        <Empty>Only parents can see the change history.</Empty>
      </>
    );
  }

  const nameOf = (id: unknown) => members.find((m) => m.user_id === id)?.display_name ?? (id ? "a former member" : "nobody");
  const show = (key: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (PEOPLE.has(key)) return nameOf(v);
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      return new Date(v).toLocaleString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    if (Array.isArray(v)) return v.join(", ");
    return String(v).slice(0, 80);
  };
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <PageHeader title="History" subtitle="Who changed what, when — and what it was before" />
      {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
      <Card>
        {!data ? (
          <Skeleton />
        ) : data.length === 0 ? (
          <Empty>No changes yet.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {data.map((row) => {
              const who = members.find((m) => m.user_id === row.changed_by);
              const verb = row.action === "insert" ? "added" : row.action === "delete" ? "deleted" : "changed";
              const thing = THING[row.table_name] ?? row.table_name;
              const changes =
                row.action === "update" && row.old_data && row.new_data
                  ? Object.keys(row.new_data).filter(
                      (k) => !HIDDEN.has(k) && JSON.stringify(row.old_data![k]) !== JSON.stringify(row.new_data![k]),
                    )
                  : [];
              return (
                <li key={row.id} className="flex gap-3 py-3">
                  {who ? <Avatar name={who.display_name} color={who.color} /> : <span className="w-6 text-center">⚙️</span>}
                  <div className="min-w-0 flex-1 text-[15px]">
                    <p>
                      <strong>{who?.display_name ?? (row.changed_by ? "A former member" : "The system")}</strong> {verb} {thing}
                      {label(row) && <> “{label(row)}”</>}
                    </p>
                    {changes.map((k) => (
                      <p key={k} className="text-sm text-muted">
                        {FIELD[k] ?? k}: <span className="line-through">{show(k, row.old_data![k])}</span> → <span className="text-ink">{show(k, row.new_data![k])}</span>
                      </p>
                    ))}
                    <p className="text-xs text-muted">{when(row.changed_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.length >= limit && (
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setLimit(limit + 100)}>
            Show older
          </Button>
        )}
      </Card>
    </>
  );
}
