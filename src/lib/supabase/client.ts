"use client";

import { createClient as create, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { DB_SCHEMA, supabaseEnv } from "./env";

export type DB = SupabaseClient<Database, typeof DB_SCHEMA>;

let client: DB | undefined;

/**
 * The single browser Supabase client. The publishable key is safe in the browser:
 * row-level security in the database decides what each signed-in user can see.
 */
export function getSupabase(): DB {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = create<Database, typeof DB_SCHEMA>(url, key, {
      db: { schema: DB_SCHEMA },
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
