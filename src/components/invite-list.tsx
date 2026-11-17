"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/action-form";
import { Input, RoleBadge } from "@/components/ui";
import { errorMessage } from "@/lib/form";
import { acceptInvite, declineInvite } from "@/lib/planner";
import { getSupabase } from "@/lib/supabase/client";
import type { MyInvite } from "@/lib/supabase/types";

/** Pending invites sent to the signed-in user's email address. */
export function InviteList({ onAccepted }: { onAccepted: () => void | Promise<void> }) {
  const [invites, setInvites] = useState<MyInvite[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase().rpc("my_invites");
    setInvites(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data from Supabase
    void load();
  }, [load]);

  if (!invites?.length) return null;

  return (
    <div className="space-y-3">
      {invites.map((inv) => (
        <div key={inv.id} className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
          <p className="font-medium">
            ✉️ {inv.invited_by_name ?? "Someone"} invited you to join <strong>{inv.family_name}</strong> as <RoleBadge role={inv.role} />
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={50} className="min-w-0 flex-1" aria-label="Your name" />
            <Button
              onClick={async () => {
                setError(null);
                try {
                  await acceptInvite(inv.id, name);
                  await load();
                  await onAccepted();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Accept
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                try {
                  await declineInvite(inv.id);
                  await load();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
