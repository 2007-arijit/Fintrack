import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_MS = 4 * 60 * 1000; // every 4 minutes while the app is open

/** Silently keeps `user_preferences.last_seen_at` fresh so the developer
 *  dashboard can show "last online" for each user. No UI, no toasts. */
export function useLastSeenHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const touch = () => {
      supabase.from("user_preferences").update({ last_seen_at: new Date().toISOString() }).eq("user_id", user.id).then(
        () => {},
        () => {}
      );
    };

    touch();
    const id = setInterval(touch, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [user]);
}
