"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { Avatar, Field, Input, RoleBadge, Switch } from "@/components/ui";
import { errorMessage } from "@/lib/form";
import { removeMember, setMemberSettings, updateMemberProfile } from "@/lib/planner";
import { describeRule, ruleAppliesTo } from "@/lib/rules";
import type { EventPermission, FamilyMember, MemberRole } from "@/lib/supabase/types";

export const ALL_CHILDREN = "all";

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line/60 py-4">
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Settings for one child — or for "All children" (target = ALL_CHILDREN), where every change
 * asks "Apply to all children?" first.
 */
export function ChildSheet({ target, onClose }: { target: string | null; onClose: () => void }) {
  const ctx = useFamily();
  if (!target) return null;
  const all = target === ALL_CHILDREN;
  const children = ctx.rawMembers.filter((m) => m.role === "child");
  const person = all ? null : ctx.rawMembers.find((m) => m.user_id === target);
  if (!all && !person) return null;
  const group: FamilyMember[] = all ? children : [person!];
  const shownName = all ? "All children" : person!.nickname || person!.display_name;

  // Same value for everyone → show it; different → "mixed".
  const same = <K extends keyof FamilyMember>(k: K) => {
    const vals = new Set(group.map((m) => m[k]));
    return vals.size === 1 ? (group[0]?.[k] as FamilyMember[K]) : undefined;
  };

  async function apply(patch: Parameters<typeof setMemberSettings>[2]) {
    if (all) {
      if (!children.length) return alert("There are no children in the family yet.");
      if (!confirm(`Apply to all children (${children.length})?`)) return;
    }
    try {
      await setMemberSettings(ctx, group.map((m) => m.user_id), patch);
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  const perm = same("event_permission");
  const cars = same("can_assign_cars");
  const profile = same("can_edit_profile");
  const rules = person ? ctx.rules.filter((r) => ruleAppliesTo(r, person)) : ctx.rules.filter((r) => r.target_role === "child" || (!r.target_user && !r.target_role));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={shownName}>
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
          <h2 className="text-base font-semibold">{shownName}</h2>
          <span className="w-4" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {person ? (
            <div className="flex items-center gap-3 py-4">
              <Avatar name={shownName} color={person.color} />
              <div className="flex-1">
                <p className="text-lg font-semibold">{shownName}</p>
                <p className="text-sm text-muted">
                  {person.nickname ? `${person.display_name} · ` : ""}
                  {person.family_confirmed ? "Confirmed this is their real family ✓" : "Hasn't confirmed their family yet"}
                </p>
              </div>
              <RoleBadge role={person.role} />
            </div>
          ) : (
            <p className="py-4 text-[15px] text-muted">
              Changes here apply to every child ({children.length}). You&apos;ll be asked to confirm first.
            </p>
          )}

          {person && (
            <details className="border-b border-line/60 py-2 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center py-2 font-medium">
                <span className="flex-1">Name &amp; nickname</span>
                <span className="text-muted">⌄</span>
              </summary>
              <ActionForm
                onSubmit={(f) => updateMemberProfile(ctx, person.user_id, f)}
                submitLabel="Save"
                resetOnSuccess={false}
                successMessage="Saved"
                className="flex flex-col gap-3 pb-3"
              >
                <Field label="Name">
                  <Input name="display_name" defaultValue={person.display_name} maxLength={50} required />
                </Field>
                <Field label="Nickname">
                  <Input name="nickname" defaultValue={person.nickname ?? ""} maxLength={40} placeholder="Optional" />
                </Field>
              </ActionForm>
            </details>
          )}

          {person && (
            <Row title="Role" hint="Parents can change everything in the family">
              <select
                value={person.role}
                onChange={async (e) => {
                  const role = e.target.value as MemberRole;
                  if (role === "parent" && !confirm(`Make ${shownName} a parent? Parents can manage everything.`)) return;
                  await apply({ role });
                }}
                className="rounded-xl border border-line bg-white px-3 py-2 text-base"
                aria-label="Role"
              >
                <option value="child">Child</option>
                <option value="other">Other</option>
                <option value="parent">Parent</option>
              </select>
            </Row>
          )}

          <Row title="Adding events" hint={perm === undefined ? "Different for each child" : undefined}>
            <select
              value={perm ?? ""}
              onChange={(e) => e.target.value && apply({ event_permission: e.target.value as EventPermission })}
              className="rounded-xl border border-line bg-white px-3 py-2 text-base"
              aria-label="Adding events"
            >
              {perm === undefined && <option value="">Mixed…</option>}
              <option value="allowed">Can add</option>
              <option value="approval">Needs approval</option>
              <option value="blocked">Can&apos;t add</option>
            </select>
          </Row>

          <Row title="Can choose cars" hint="For their own events">
            <Switch label="Can choose cars" checked={Boolean(cars)} mixed={cars === undefined} onChange={(v) => apply({ can_assign_cars: v })} />
          </Row>

          <Row title="Can change their own name, nickname & colour">
            <Switch
              label="Can change their own name, nickname and colour"
              checked={Boolean(profile)}
              mixed={profile === undefined}
              onChange={(v) => apply({ can_edit_profile: v })}
            />
          </Row>

          <div className="border-b border-line/60 py-4">
            <div className="mb-1 flex items-center">
              <p className="flex-1 font-medium">House rules</p>
              <Link href="/rules" className="text-sm font-semibold underline">
                Edit rules
              </Link>
            </div>
            {rules.length === 0 ? (
              <p className="text-sm text-muted">No rules{all ? " for children" : ""}.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {rules.map((r) => {
                  const d = describeRule(r, ctx.members);
                  return (
                    <li key={r.id}>
                      🔒 {d.who}: no changes to {d.what} — {d.when}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {person && person.user_id !== ctx.userId && (
            <div className="py-5">
              <Button
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Remove ${shownName} from the family?`)) return;
                  try {
                    await removeMember(ctx, person.user_id);
                    onClose();
                  } catch (e) {
                    alert(errorMessage(e));
                  }
                }}
              >
                Remove from family
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
