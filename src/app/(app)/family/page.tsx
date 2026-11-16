import type { Metadata } from "next";
import { Suspense } from "react";
import { leaveFamily, regenerateInviteCode, updateFamily, updateMyProfile } from "@/app/actions/family";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Card, Field, Input, PageHeader, Skeleton } from "@/components/ui";
import { requireFamily } from "@/lib/family";

export const metadata: Metadata = { title: "Family" };

export default function FamilyPage() {
  return (
    <>
      <PageHeader title="Family" subtitle="Members, invites and settings" />
      <Suspense fallback={<Skeleton />}>
        <Family />
      </Suspense>
    </>
  );
}

async function Family() {
  const { family, me, members, email } = await requireFamily();
  const isOwner = me.role === "owner";

  return (
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
        <p className="mb-3 text-sm text-zinc-500">Share this code. They sign up, choose “Join a family” and enter it.</p>
        <p className="mb-4 select-all rounded-lg bg-zinc-100 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] dark:bg-zinc-800">
          {family.invite_code}
        </p>
        {isOwner && (
          <form action={regenerateInviteCode}>
            <SubmitButton variant="ghost">Get a new code (old one stops working)</SubmitButton>
          </form>
        )}
      </Card>

      <Card title="Your profile">
        <p className="mb-3 text-sm text-zinc-500">{email}</p>
        <ActionForm action={updateMyProfile} submitLabel="Save" resetOnSuccess={false} successMessage="Saved">
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
          <ActionForm action={updateFamily} submitLabel="Save" resetOnSuccess={false} successMessage="Saved">
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
          <form action={leaveFamily}>
            <SubmitButton variant="danger">Leave {family.name}</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
