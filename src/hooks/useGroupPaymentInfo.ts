import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MemberPaymentInfo {
  member_user_id: string;
  display_name: string | null;
  upi_id: string | null;
}

/** UPI id (and display name) for every member of a group who has a linked
 *  FinTrack account — fetched via a SECURITY DEFINER RPC since
 *  user_preferences is otherwise locked to "view own row only". */
export function useGroupPaymentInfo(groupId: string | undefined) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["group_payment_info", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_group_payment_info", { _group_id: groupId! });
      if (error) throw error;
      return data as MemberPaymentInfo[];
    },
    enabled: !!user && !!groupId,
  });

  const byUserId = new Map((query.data ?? []).map((p) => [p.member_user_id, p]));

  return {
    paymentInfo: query.data ?? [],
    upiIdFor: (memberUserId: string | null) => (memberUserId ? byUserId.get(memberUserId)?.upi_id ?? null : null),
    isLoading: query.isLoading,
  };
}
