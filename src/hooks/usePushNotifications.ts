import { useCallback, useEffect, useState } from "react";
import { safeGet, safeSet } from "@/lib/safeStorage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/pushConfig";

const PROMPT_KEY = "fintrack_push_prompt_last_asked_at";
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // ask again once a day, not on every refresh

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Subscribes the current device to push and saves the subscription to
 *  Supabase. Safe to call repeatedly — upserts on the unique endpoint. */
export async function subscribeToPush(userId: string): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
}

/** Drives the "turn on notifications?" prompt: shows once, and if
 *  declined, re-shows at most once every 24h (never on every refresh).
 *  If the user has already granted or the browser has already blocked
 *  permission, no prompt is shown either way. */
export function usePushPrompt() {
  const { user } = useAuth();
  const [shouldPrompt, setShouldPrompt] = useState(false);

  useEffect(() => {
    if (!user || !isPushSupported()) return;

    const permission = Notification.permission;
    if (permission === "granted") {
      subscribeToPush(user.id).catch(() => {});
      return;
    }
    if (permission === "denied") return; // browser blocks any further JS-triggered prompt

    const lastAsked = Number(safeGet(PROMPT_KEY) || 0);
    if (Date.now() - lastAsked > PROMPT_COOLDOWN_MS) {
      setShouldPrompt(true);
    }
  }, [user]);

  const dismiss = useCallback(() => {
    safeSet(PROMPT_KEY, String(Date.now()));
    setShouldPrompt(false);
  }, []);

  const enable = useCallback(async () => {
    safeSet(PROMPT_KEY, String(Date.now()));
    setShouldPrompt(false);
    if (!isPushSupported() || !user) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await subscribeToPush(user.id).catch(() => {});
    }
  }, [user]);

  return { shouldPrompt, enable, dismiss };
}
