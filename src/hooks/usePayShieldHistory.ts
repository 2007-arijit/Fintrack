import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isRiskLevel } from "@/lib/payshieldRisk";
import type { Finding, InputKind, ScanResult } from "@/lib/payshieldEngine";

const KINDS: InputKind[] = ["message", "url", "upi"];

/** The signed-in user's last 20 scans. RLS restricts rows; the explicit user_id filter is belt and braces. */
export function usePayShieldHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["payshield_history", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ScanResult[]> => {
      const { data, error } = await (supabase as any)
        .from("payshield_scans")
        .select("id, created_at, input_kind, input_preview, risk_level, risk_score, findings, ai_summary, ai_used")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? [])
        .filter((row: any) => isRiskLevel(row.risk_level) && KINDS.includes(row.input_kind))
        .map((row: any): ScanResult => ({
          id: row.id,
          createdAt: row.created_at,
          ts: Date.parse(row.created_at),
          kind: row.input_kind,
          risk: row.risk_level,
          score: Number(row.risk_score) || 0,
          findings: Array.isArray(row.findings) ? (row.findings as Finding[]) : [],
          preview: row.input_preview ?? "",
          aiSummary: row.ai_summary ?? undefined,
          aiState: row.ai_used ? "ok" : "off",
          saved: true,
        }));
    },
  });
}
