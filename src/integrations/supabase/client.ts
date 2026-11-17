import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Active Supabase project credentials for FinTrack
const ACTIVE_SUPABASE_URL = "https://oalopbwepggauspxcspc.supabase.co";
const ACTIVE_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hbG9wYndlcGdnYXVzcHhjc3BjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxOTk2MTMsImV4cCI6MjEwOTc3NTYxM30.aEWPE8nrqHnjSHD1TMKtlvkNy1O5AQYWKLld3F69-SU";

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Guard against stale Vercel environment variables pointing to obsolete project instances (e.g. rdmsapcwxaunelphehcc)
const isStaleOrMissing =
  !envUrl ||
  !envKey ||
  envUrl.includes("rdmsapcwxaunelphehcc");

const SUPABASE_URL = isStaleOrMissing ? ACTIVE_SUPABASE_URL : envUrl;
const SUPABASE_ANON_KEY = isStaleOrMissing ? ACTIVE_SUPABASE_ANON_KEY : envKey;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
