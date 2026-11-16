import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { createFamily, joinFamily } from "@/app/actions/family";
import { ActionForm } from "@/components/action-form";
import { TimezoneInput } from "@/components/timezone-input";
import { Card, Field, Input, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/family";

export const metadata: Metadata = { title: "Set up your family" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold">Set up your family</h1>
      <p className="mb-8 text-sm text-zinc-500">Start a new family, or join one with an invite code.</p>
      <Suspense fallback={<Skeleton />}>
        <Onboarding />
      </Suspense>
    </main>
  );
}

async function Onboarding() {
  const { supabase, userId } = await requireUser();
  const { count } = await supabase
    .from("family_members")
    .select("family_id", { count: "exact", head: true })
    .eq("user_id", userId);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {count ? (
        <p className="sm:col-span-2 text-sm">
          You&apos;re already in a family.{" "}
          <Link href="/dashboard" className="font-medium text-indigo-600 underline">
            Go to your planner
          </Link>
        </p>
      ) : null}
      <Card title="Start a new family">
        <ActionForm action={createFamily} submitLabel="Create family">
          <Field label="Family name">
            <Input name="name" placeholder="The Smiths" maxLength={80} required />
          </Field>
          <Field label="Your name">
            <Input name="display_name" placeholder="Mom" maxLength={50} required />
          </Field>
          <TimezoneInput />
        </ActionForm>
      </Card>
      <Card title="Join a family">
        <ActionForm action={joinFamily} submitLabel="Join family">
          <Field label="Invite code">
            <Input name="invite_code" placeholder="ABCD2345" maxLength={20} className="uppercase" required />
          </Field>
          <Field label="Your name">
            <Input name="display_name" placeholder="Sam" maxLength={50} required />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
