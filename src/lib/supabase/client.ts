import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";
import { DB_SCHEMA, supabaseEnv } from "./env";

/** Supabase client for Client Components (e.g. realtime subscriptions). */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient<Database, typeof DB_SCHEMA>(url, key, { db: { schema: DB_SCHEMA } });
}
