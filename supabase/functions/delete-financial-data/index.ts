// Permanently clears the caller's financial records after password re-authentication.
// The service-role key is used only server-side, and the RPC refuses non-service-role callers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in is required." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration is incomplete." }, 500);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.email) return json({ error: "Your session is invalid. Please sign in again." }, 401);

    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || password.length > 1024) return json({ error: "Enter your current password to continue." }, 400);

    const verifier = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: passwordError } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (passwordError) return json({ error: "Password verification failed. No data was deleted." }, 401);

    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: wipeError } = await adminClient.rpc("delete_user_financial_data", { _user_id: user.id });
    if (wipeError) {
      console.error("delete-financial-data: database cleanup failed", wipeError.message);
      return json({ error: "Could not delete financial data. Please try again or contact support." }, 500);
    }

    return json({ success: true });
  } catch (error) {
    console.error("delete-financial-data error:", error);
    return json({ error: "Unexpected server error." }, 500);
  }
});
