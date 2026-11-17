// send-push: delivers Family Planner inbox notifications to phones (Web Push).
//
//  GET  -> returns the public VAPID key the app needs to subscribe (creates the key pair on first use).
//  POST -> called by the database trigger `family_planner.push_notification` with
//          { notification_id } and the shared secret in `x-push-secret`.
//
// Keys and the shared secret live in Supabase Vault and never leave the server.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "family_planner" }, auth: { persistSession: false } },
);

const APP_URL = "https://damic3.github.io/family-planner";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

type Config = { webhook_secret: string; vapid_public: string | null; vapid_private: string | null };

async function loadConfig(): Promise<Config> {
  const { data, error } = await supabase.rpc("push_config");
  if (error) throw error;
  let cfg = data as Config;
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const keys = webpush.generateVAPIDKeys();
    const { error: setErr } = await supabase.rpc("set_vapid_keys", { p_public: keys.publicKey, p_private: keys.privateKey });
    if (setErr) throw setErr;
    const again = await supabase.rpc("push_config");
    if (again.error) throw again.error;
    cfg = again.data as Config;
  }
  return cfg;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } });

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const cfg = await loadConfig();

    if (req.method === "GET") return json({ publicKey: cfg.vapid_public }, 200, CORS);
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    if (!safeEqual(req.headers.get("x-push-secret") ?? "", cfg.webhook_secret)) {
      return json({ error: "unauthorized" }, 401);
    }

    const { notification_id } = await req.json();
    if (typeof notification_id !== "string") return json({ error: "bad request" }, 400);

    const { data: n, error } = await supabase
      .from("notifications")
      .select("id, user_id, title, body, url")
      .eq("id", notification_id)
      .maybeSingle();
    if (error) throw error;
    if (!n) return json({ sent: 0 });

    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", n.user_id);
    if (subErr) throw subErr;

    webpush.setVapidDetails(APP_URL, cfg.vapid_public!, cfg.vapid_private!);
    const payload = JSON.stringify({ title: n.title, body: n.body ?? "", url: n.url ?? "/inbox/", tag: n.id });

    let sent = 0;
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 60 * 60 * 24 },
          );
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // The phone unsubscribed or the app was uninstalled: forget this device.
          if (status === 404 || status === 410) await supabase.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("push failed", status, (e as Error).message);
        }
      }),
    );
    return json({ sent });
  } catch (e) {
    console.error(e);
    return json({ error: "internal error" }, 500, CORS);
  }
});
