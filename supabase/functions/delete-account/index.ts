// Supabase Edge Function: delete-account
//
// Permanently deletes the authenticated user's data AND their Supabase
// Auth account. This can only run server-side because deleting an auth
// user requires the service-role key, which must never reach the client.
//
// Deploy:  supabase functions deploy delete-account
// Secrets required (set automatically by Supabase, or via `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Called from the client as:
//   await supabase.functions.invoke('delete-account')
// (the user's access token is attached automatically by supabase-js)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client scoped to the caller's own JWT — used to identify who is
    // asking, and to run the data-wipe RPC under their own RLS context.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Wipe every user-owned row first (SECURITY DEFINER RPC, scoped to auth.uid()).
    const { error: dataError } = await userClient.rpc("delete_my_account_data");
    if (dataError) {
      return new Response(JSON.stringify({ error: `Failed to delete account data: ${dataError.message}` }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Now remove the Auth user itself — requires the service role key.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: `Data was deleted but account removal failed: ${deleteError.message}` }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
