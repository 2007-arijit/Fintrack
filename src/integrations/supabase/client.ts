import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const RAW_URL = import.meta.env.VITE_SUPABASE_URL?.trim();
const RAW_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Validate configuration WITHOUT throwing. A throw at module load happens before React mounts,
 * which is what produced the blank white page. Instead we record the problem and let the UI
 * (see ConfigMissing) explain how to fix it.
 */
function validate(): string | null {
  if (!RAW_URL || !RAW_KEY) {
    return "VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are not set.";
  }
  try {
    const u = new URL(RAW_URL);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      return "VITE_SUPABASE_URL must use HTTPS (http is only allowed for localhost).";
    }
  } catch {
    return "VITE_SUPABASE_URL is not a valid URL.";
  }
  return null;
}

export const supabaseConfigError: string | null = validate();

// Placeholder values keep createClient() from throwing when configuration is missing.
// Nothing renders against them: main.tsx shows the setup screen instead of the app.
const SAFE_URL = supabaseConfigError ? "https://placeholder.supabase.co" : RAW_URL!;
const SAFE_KEY = supabaseConfigError ? "placeholder-anon-key" : RAW_KEY!;

function safeStorage(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined; // storage blocked (private mode / disabled cookies)
  }
}

export const supabase = createClient<Database>(SAFE_URL, SAFE_KEY, {
  auth: {
    storage: safeStorage(),
    persistSession: true,
    autoRefreshToken: !supabaseConfigError,
  },
});
