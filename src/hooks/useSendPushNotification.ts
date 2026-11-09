import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SendPushArgs {
  title: string;
  body: string;
  audience: "all" | "selected";
  userIds?: string[];
}

export function useSendPushNotification() {
  return useMutation({
    mutationFn: async (args: SendPushArgs) => {
      const { data, error } = await supabase.functions.invoke("send-push", { body: args });
      if (error) {
        // supabase-js's generic error.message ("Edge Function returned a
        // non-2xx status code") hides the actual reason — it's in the
        // raw response body instead, so read that out for a useful message.
        let detail = "";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            const body = await ctx.clone().json().catch(() => null);
            detail = body?.error || (await ctx.clone().text().catch(() => ""));
          }
        } catch {
          // fall through to generic message below
        }
        throw new Error(detail || error.message || "Failed to send notification");
      }
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; sent: number; failed: number; targeted: number };
    },
    onSuccess: (data) => {
      toast.success(`Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}${data.failed ? ` (${data.failed} failed)` : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
