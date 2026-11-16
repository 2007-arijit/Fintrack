// Supabase Edge Function: send-push
//
// Sends real Web Push notifications (the kind that show up in the phone's
// notification shade / lock screen, or the OS notification center on
// desktop) to one or more users, using the VAPID key pair. Developer-only.
//
// Deploy:  supabase functions deploy send-push
// Secrets required (set via `supabase secrets set`):
//   VAPID_PUBLIC_KEY   — must match src/lib/pushConfig.ts exactly
//   VAPID_PRIVATE_KEY  — NEVER put this in client code
//   VAPID_SUBJECT      — e.g. mailto:you@example.com (required by the push spec)
// (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided
//  automatically by the Supabase platform.)
//
// Called from the client as:
//   await supabase.functions.invoke('send-push', {
//     body: { title, body, audience: 'all' | 'selected', userIds?: string[] }
//   })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "https://esm.sh/web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("send-push: missing Authorization header");
      return json({ error: "Missing Authorization header" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      console.error("send-push: missing VAPID secrets", {
        hasPublic: !!VAPID_PUBLIC_KEY,
        hasPrivate: !!VAPID_PRIVATE_KEY,
        hasSubject: !!VAPID_SUBJECT,
      });
      return json({ error: "Push is not configured: missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT secrets" }, 500);
    }

    // Caller must be an authenticated, on-record developer.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("send-push: invalid session", userError?.message);
      return json({ error: "Invalid or expired session" }, 401);
    }

    // Check block status before developer authorization or privileged work.
    const { data: isBlocked, error: blockError } = await userClient.rpc("is_user_blocked");
    if (blockError) {
      console.error("send-push: could not verify account status", blockError.message);
      return json({ error: "Unable to verify account status. Please try again." }, 503);
    }
    if (isBlocked) {
      return json({ error: "Your account is temporarily blocked from this action." }, 403);
    }

    const { data: isDev, error: devError } = await userClient.rpc("is_developer");
    if (devError || !isDev) {
      console.error("send-push: not authorized", devError?.message, "isDev=", isDev);
      return json({ error: "Not authorized" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.body === "string" ? body.body.trim() : "";
    const audience = body.audience === "selected" ? "selected" : "all";
    const userIds: string[] = audience === "selected" && Array.isArray(body.userIds) ? body.userIds : [];

    if (!title || !message) return json({ error: "Title and body are required" }, 400);
    if (audience === "selected" && userIds.length === 0) return json({ error: "No recipients selected" }, 400);

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // Reads across every user's subscriptions — only possible with the
    // service-role key, which is why this whole function must be server-side.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    let query = adminClient.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key");
    if (audience === "selected") query = query.in("user_id", userIds);
    const { data: subs, error: subsError } = await query;
    if (subsError) {
      console.error("send-push: failed to read subscriptions", subsError.message);
      return json({ error: subsError.message }, 500);
    }

    console.log(`send-push: sending to ${subs?.length ?? 0} subscription(s), audience=${audience}`);

    const payload = JSON.stringify({ title, body: message });
    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    await Promise.all(
      (subs ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            payload
          );
          sent++;
        } catch (e) {
          failed++;
          const statusCode = e?.statusCode;
          console.error("send-push: delivery failed", statusCode, e?.body || e?.message || e);
          if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
        }
      })
    );

    if (staleIds.length > 0) {
      await adminClient.from("push_subscriptions").delete().in("id", staleIds);
    }

    return json({ success: true, sent, failed, targeted: subs?.length ?? 0 });
  } catch (e) {
    console.error("send-push: uncaught error", e instanceof Error ? e.stack || e.message : e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
