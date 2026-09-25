/**
 * The device's Supabase client, made on first use, like the database.
 *
 * The session lives in `localStorage` on the web, so a reopened tab is still
 * signed in. On native, supabase-js has no storage and keeps it in memory: a
 * restarted app keeps its practice and its mode, but has to sign in again
 * before it syncs. Storing the session comes with real sign-in (M10).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { syncConfig } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client === null) {
    const { supabaseUrl, supabaseKey } = syncConfig();
    client = createClient(supabaseUrl, supabaseKey, { auth: { detectSessionInUrl: false } });
  }
  return client;
}
