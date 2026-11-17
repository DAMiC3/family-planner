"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/action-form";
import { errorMessage } from "@/lib/form";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";

/** Turn phone notifications on/off for this device. */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  if (!state) return null;

  const text: Record<PushState, string> = {
    on: "Notifications are on for this device.",
    off: "Get a notification on this device when something needs you.",
    denied: "Notifications are blocked. Allow them for this site in your phone's browser settings, then come back.",
    "needs-install": "On iPhone/iPad, first add Family Planner to your Home Screen (Share → Add to Home Screen), then open it from there to turn on notifications.",
    unsupported: "This browser can't show notifications. Try Chrome on Android, or Safari after adding the app to your Home Screen.",
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
      <p className="font-medium">🔔 Phone notifications</p>
      <p className="mt-1 text-zinc-500">{text[state]}</p>
      {(state === "on" || state === "off") && (
        <Button
          className="mt-3"
          variant={state === "on" ? "ghost" : "primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              if (state === "on") await disablePush();
              else await enablePush();
              setState(await getPushState());
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Please wait…" : state === "on" ? "Turn off" : "Turn on notifications"}
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-red-600">{error}</p>}
    </div>
  );
}
