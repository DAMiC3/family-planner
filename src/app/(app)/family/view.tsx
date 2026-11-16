"use client";

import { useRouter } from "next/navigation";
import { ActionForm, Button } from "@/components/action-form";
import { useFamily } from "@/components/family-provider";
import { InstallPrompt } from "@/components/pwa";
import { Avatar, Card, Field, Input, PageHeader } from "@/components/ui";
import { errorMessage } from "@/lib/form";
import { leaveFamily, regenerateInviteCode, updateFamily, updateMyProfile } from "@/lib/planner";

export function FamilyView() {
  const ctx = useFamily();
  const { family, me, members, email } = ctx;
  const isOwner = me.role === "owner";
  const router = useRouter();

  return (
    <>
      <PageHeader title="Family" subtitle="Members, invites and settings" />
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
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Invite family members">
          <p className="mb-3 text-sm text-zinc-500">Share this code. They open the app, create an account, choose “Join a family” and enter it.</p>
          <p className="mb-4 select-all rounded-lg bg-zinc-100 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] dark:bg-zinc-800">
            {family.invite_code}
          </p>
          {isOwner && (
            <Button variant="ghost" onClick={() => regenerateInviteCode(ctx).catch((e) => alert(errorMessage(e)))}>
              Get a new code (old one stops working)
            </Button>
          )}
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

        {isOwner ? (
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
        ) : (
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
        )}
      </div>
    </>
  );
}
