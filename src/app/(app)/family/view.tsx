"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ActButton, ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { InstallPrompt } from "@/components/pwa";
import { Avatar, Card, Field, Input, PageHeader, RoleBadge, Select } from "@/components/ui";
import { withBase } from "@/lib/base-path";
import { errorMessage } from "@/lib/form";
import {
  inviteByEmail,
  leaveFamily,
  regenerateInviteCode,
  removeMember,
  revokeInvite,
  setMemberRole,
  updateFamily,
  updateMyProfile,
} from "@/lib/planner";
import { ROLES } from "@/lib/rules";
import type { Invite, MemberRole } from "@/lib/supabase/types";

export function FamilyView() {
  const ctx = useFamily();
  const { family, me, members, email, isParent, supabase } = ctx;
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);

  const loadInvites = useCallback(async () => {
    if (!isParent) return;
    const { data } = await supabase.from("invites").select("*").eq("family_id", family.id).is("accepted_at", null).order("created_at");
    setInvites(data ?? []);
  }, [isParent, supabase, family.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data from Supabase
    void loadInvites();
  }, [loadInvites]);

  const appLink = typeof window !== "undefined" ? `${window.location.origin}${withBase("/login/")}` : "";

  async function share(text: string) {
    try {
      if (navigator.share) await navigator.share({ title: "Family Planner", text, url: appLink });
      else {
        await navigator.clipboard.writeText(`${text} ${appLink}`);
        alert("Copied — paste it into WhatsApp or SMS.");
      }
    } catch {
      /* share sheet closed */
    }
  }

  return (
    <>
      <PageHeader title="Family" subtitle="Members, roles, invites and settings" />
      <div className="mb-6">
        <InstallPrompt />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card title={`Members (${members.length})`}>
          <ul className="space-y-3">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 text-sm">
                <Avatar name={m.display_name} color={m.color} />
                <span className="flex-1 font-medium">
                  {m.display_name}
                  {m.user_id === me.user_id && <span className="ml-1 text-zinc-400">(you)</span>}
                </span>
                {isParent ? (
                  <Select
                    aria-label={`Role for ${m.display_name}`}
                    value={m.role}
                    className="w-28 py-1"
                    onChange={(e) => setMemberRole(ctx, m.user_id, e.target.value as MemberRole).catch((err) => alert(errorMessage(err)))}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {isParent && m.user_id !== me.user_id && (
                  <ActButton
                    run={async () => {
                      if (confirm(`Remove ${m.display_name} from the family?`)) await removeMember(ctx, m.user_id);
                    }}
                    label={`Remove ${m.display_name}`}
                    className="px-1 text-zinc-400 hover:text-red-600"
                  >
                    ✕
                  </ActButton>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">
            <strong>Parents</strong> manage the family, rules and activity slots. <strong>Children</strong> and{" "}
            <strong>others</strong> can be limited with house rules.
          </p>
          <Link href="/rules" className="mt-3 inline-block text-sm font-medium text-brand-600">
            {isParent ? "Manage house rules →" : "See house rules →"}
          </Link>
        </Card>

        {isParent && (
          <Card title="Invite someone">
            <ActionForm
              onSubmit={async (f) => {
                await inviteByEmail(ctx, f);
                await loadInvites();
              }}
              submitLabel="Send invite"
              successMessage="Invite saved — now share the app link with them"
            >
              <Field label="Their email">
                <Input name="email" type="email" required maxLength={254} placeholder="sam@example.com" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="child">
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
            {invites.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-zinc-100 pt-3 text-sm">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{inv.email}</span>
                    <RoleBadge role={inv.role} />
                    <Button variant="ghost" className="px-2 py-1" onClick={() => share(`Join our family on Family Planner! Sign up with ${inv.email}:`)}>
                      Share
                    </Button>
                    <ActButton run={async () => { await revokeInvite(ctx, inv.id); await loadInvites(); }} label="Cancel invite" className="px-1 text-zinc-400 hover:text-red-600">
                      ✕
                    </ActButton>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-zinc-500">
              They sign up with that email, then accept the invite in their Inbox. Their role is set automatically.
            </p>
          </Card>
        )}

        <Card title="Family code">
          <p className="mb-3 text-sm text-zinc-500">Anyone with this code can join as “Other”. A parent can change their role after.</p>
          <p className="mb-4 select-all rounded-lg bg-zinc-100 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em]">
            {family.invite_code}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => share(`Join our family on Family Planner with code ${family.invite_code}:`)}>
              Share code
            </Button>
            {isParent && (
              <Button variant="ghost" onClick={() => regenerateInviteCode(ctx).catch((e) => alert(errorMessage(e)))}>
                New code
              </Button>
            )}
          </div>
        </Card>

        <Card title="Your profile">
          <p className="mb-3 text-sm text-zinc-500">{email}</p>
          <ActionForm onSubmit={(f) => updateMyProfile(ctx, f)} submitLabel="Save" resetOnSuccess={false} successMessage="Saved">
            <Field label="Name">
              <Input name="display_name" defaultValue={me.display_name} maxLength={50} required />
            </Field>
            <Field label="Colour">
              <Input name="color" type="color" defaultValue={me.color} className="h-10 w-20 p-1" />
            </Field>
          </ActionForm>
        </Card>

        {isParent && (
          <Card title="Family settings">
            <ActionForm onSubmit={(f) => updateFamily(ctx, f)} submitLabel="Save" resetOnSuccess={false} successMessage="Saved">
              <Field label="Family name">
                <Input name="name" defaultValue={family.name} maxLength={80} required />
              </Field>
              <Field label="Timezone">
                <Input name="timezone" defaultValue={family.timezone} maxLength={64} required placeholder="Africa/Johannesburg" />
              </Field>
            </ActionForm>
          </Card>
        )}

        <Card title="Leave family">
          <p className="mb-3 text-sm text-zinc-500">You&apos;ll lose access to this family&apos;s planner.</p>
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm(`Leave ${family.name}?`)) return;
              try {
                await leaveFamily(ctx);
                router.replace("/onboarding");
              } catch (e) {
                alert(errorMessage(e));
              }
            }}
          >
            Leave {family.name}
          </Button>
        </Card>
      </div>
    </>
  );
}
