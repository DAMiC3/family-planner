"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { withBase } from "@/lib/base-path";

/** Registers the service worker so the app can be installed and opens offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }).catch(() => {});
  }, []);
  return null;
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function subscribeNothing() {
  return () => {};
}

function useIsStandalone() {
  return useSyncExternalStore(
    subscribeNothing,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => true,
  );
}

function useIsIos() {
  return useSyncExternalStore(
    subscribeNothing,
    () =>
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    () => false,
  );
}

/**
 * "Install app" card. Android / Chrome / Edge get a one-tap install button;
 * iPhone / iPad get Add-to-Home-Screen instructions (Apple has no install prompt).
 */
export function InstallPrompt() {
  const standalone = useIsStandalone();
  const ios = useIsIos();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || dismissed || (!deferred && !ios)) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-100">
      <span className="text-2xl" aria-hidden>
        📲
      </span>
      <div className="flex-1">
        <p className="font-semibold">Install Family Planner on your phone</p>
        {deferred ? (
          <p className="mt-1">Add it to your home screen — it opens full-screen like a normal app.</p>
        ) : (
          <p className="mt-1">
            Tap the <strong>Share</strong> button <span aria-hidden>(⬆︎)</span> in Safari, then{" "}
            <strong>Add to Home Screen</strong>.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          {deferred && (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
              onClick={async () => {
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
              }}
            >
              Install app
            </button>
          )}
          <button type="button" className="rounded-lg px-3 py-1.5 text-indigo-700 dark:text-indigo-300" onClick={() => setDismissed(true)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shows a small banner while the phone is offline. */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      You&apos;re offline — changes need an internet connection.
    </div>
  );
}
