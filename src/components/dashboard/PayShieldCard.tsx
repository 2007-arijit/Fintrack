import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import NetworkMap from "@/components/visualizations/NetworkMap";
import { cn } from "@/lib/utils";

type Risk = "high" | "medium" | "low";
type LatestScan = {
  id: string;
  created_at: string;
  input_preview: string;
  risk_level: Risk;
  risk_score: number;
  ai_used: boolean;
};

const riskMeta: Record<Risk, { text: string; tone: string; dot: string }> = {
  high: { text: "High risk indicators", tone: "text-destructive", dot: "bg-destructive" },
  medium: { text: "Caution advised", tone: "text-warning", dot: "bg-warning" },
  low: { text: "No obvious warning signs", tone: "text-success", dot: "bg-success" },
};

/**
 * Dashboard entry point to PayShield. It reports the latest real scan and
 * nothing else — no invented scores, no decorative alarm.
 */
export function PayShieldCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payshield-latest"],
    queryFn: async (): Promise<LatestScan | null> => {
      const { data, error } = await (supabase as any)
        .from("payshield_scans")
        .select("id, created_at, input_preview, risk_level, risk_score, ai_used")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as LatestScan) ?? null;
    },
    staleTime: 60_000,
  });

  const meta = data ? riskMeta[data.risk_level] : null;

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="dash-payshield">
      <div className="grid items-center gap-4 p-5 sm:grid-cols-[1fr_180px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 id="dash-payshield" className="text-sm font-semibold text-foreground">
              PayShield
            </h2>
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Payment safety
            </span>
          </div>

          {isLoading ? (
            <div className="mt-3 space-y-2" aria-busy="true" aria-live="polite">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ) : isError ? (
            <div className="mt-2 text-sm text-muted-foreground">
              Recent scans could not be loaded.{" "}
              <button
                type="button"
                onClick={() => refetch()}
                className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Try again
              </button>
            </div>
          ) : data && meta ? (
            <div className="mt-3">
              <p className={cn("flex items-center gap-2 text-sm font-medium", meta.tone)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden="true" />
                {meta.text}
                <span className="tabular text-xs font-normal text-muted-foreground">
                  {data.risk_score}/10
                </span>
              </p>
              <p className="mt-1.5 truncate text-sm text-muted-foreground">
                “{data.input_preview || "Empty scan"}”
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(data.created_at).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
                {" · "}
                {data.ai_used ? "AI-assisted" : "Rules only"}
              </p>
            </div>
          ) : (
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              No scans yet. Check a suspicious message, link or UPI ID before you pay or reply.
            </p>
          )}

          <Link
            to="/payshield"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {data ? "Open PayShield" : "Run your first check"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="hidden h-28 w-full opacity-70 sm:block">
          <NetworkMap animated={false} className="h-28 w-full" />
        </div>
      </div>
    </section>
  );
}
