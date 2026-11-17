"use client";

import { withBase } from "@/lib/base-path";
import { getSupabase } from "@/lib/supabase/client";
import { supabaseEnv } from "@/lib/supabase/env";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iPhone/iPad only allow notifications for apps added to the Home Screen.
  if (isIos() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration(withBase("/"));
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function vapidPublicKey(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase.rpc("vapid_public_key");
  if (data) return data;
  // First ever subscription: ask the push function to create the key pair.
  const res = await fetch(`${supabaseEnv().url}/functions/v1/send-push`);
  const body = (await res.json()) as { publicKey?: string };
  if (!body.publicKey) throw new Error("Push notifications aren't set up on the server yet");
  return body.publicKey;
}

/** Ask permission and register this device for push notifications. Must be called from a tap. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed");
  const reg =
    (await navigator.serviceWorker.getRegistration(withBase("/"))) ??
    (await navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await vapidPublicKey()),
    }));
  const json = sub.toJSON();
  const { error } = await getSupabase().rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(withBase("/"));
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await getSupabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
