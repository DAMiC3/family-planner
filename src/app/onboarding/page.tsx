"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { InviteList } from "@/components/invite-list";
import { useSession } from "@/components/session-provider";
import { TimezoneInput } from "@/components/timezone-input";
import { Card, Field, Input, Skeleton } from "@/components/ui";
import { createFamily, joinFamily } from "@/lib/planner";
import { getSupabase } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    // Already in a family? Go straight to the planner.
    getSupabase()
      .from("family_members")
      .select("family_id", { count: "exact", head: true })
      .eq("user_id", session.user.id)
      .then(({ count }) => (count ? router.replace("/program") : setChecked(true)));
  }, [loading, session, router]);

  const done = async () => router.replace("/program");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-2xl font-bold">Set up your family</h1>
      <p className="mb-8 text-sm text-zinc-500">Start a new family, or join one with an invite code.</p>
      {!checked ? (
        <Skeleton />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InviteList onAccepted={done} />
          </div>
          <Card title="Start a new family">
            <ActionForm onSubmit={async (f) => { await createFamily(f); await done(); }} submitLabel="Create family">
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
            <ActionForm onSubmit={async (f) => { await joinFamily(f); await done(); }} submitLabel="Join family">
              <Field label="Family code">
                <Input name="invite_code" placeholder="ABCD2345" maxLength={20} className="uppercase" required />
              </Field>
              <Field label="Your name">
                <Input name="display_name" placeholder="Sam" maxLength={50} required />
              </Field>
            </ActionForm>
          </Card>
        </div>
      )}
    </main>
  );
}
