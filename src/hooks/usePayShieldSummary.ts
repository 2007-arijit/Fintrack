import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isRiskLevel, type RiskLevel } from "@/lib/payshieldRisk";

export interface LatestScan {
  id: string;
  createdAt: string;
  kind: "message" | "url" | "upi";
  risk: RiskLevel;
  score: number;
  aiUsed: boolean;
}

/** The signed-in user's most recent PayShield scan, or null if they have none.
 *  Read-only; RLS plus the explicit user_id filter keep it to the user's own rows. */
export function useLatestScan() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payshield_latest", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<LatestScan | null> => {
      const { data, error } = await (supabase as any)
        .from("payshield_scans")
        .select("id, created_at, input_kind, risk_level, risk_score, ai_used")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row || !isRiskLevel(row.risk_level)) return null;
      return { id: row.id, createdAt: row.created_at, kind: row.input_kind, risk: row.risk_level, score: row.risk_score, aiUsed: Boolean(row.ai_used) };
    },
  });
}
