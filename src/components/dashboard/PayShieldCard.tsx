import { Link } from "react-router-dom";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLatestScan } from "@/hooks/usePayShieldSummary";
import { RISK_META } from "@/lib/payshieldRisk";
import NetworkMap from "@/components/payshield/NetworkMap";

const KIND_LABEL = { message: "message", url: "website link", upi: "UPI ID" } as const;

/** Entry point to PayShield. Shows only what the scan history actually contains: no scans means no claims. */
export function PayShieldCard() {
  const { data: scan, isLoading, isError } = useLatestScan();

  return (
    <section aria-labelledby="ps-card-title" className="surface flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <h2 id="ps-card-title" className="font-heading text-base font-semibold">PayShield</h2>
          <p className="text-sm text-muted-foreground">Check a message, link or UPI ID before you pay.</p>
        </div>
      </div>

      <div className="mt-3 h-16 overflow-hidden rounded-lg bg-secondary/50" aria-hidden>
        <NetworkMap className="h-full w-full" />
      </div>

      <div className="mt-4 flex-1" aria-live="polite">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Recent scan status is unavailable right now. You can still run a check.</p>
        ) : scan ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Last check: {KIND_LABEL[scan.kind] ?? "item"}, {formatDistanceToNow(parseISO(scan.createdAt), { addSuffix: true })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={RISK_META[scan.risk].tone}>{RISK_META[scan.risk].label}</StatusBadge>
              <span className="text-xs text-muted-foreground">{scan.aiUsed ? "Rules and AI review" : "Rules only"}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No checks yet. Your scans will be listed here, visible only to you.</p>
        )}
      </div>

      <Button asChild variant="secondary" size="sm" className="mt-4 w-full justify-between">
        <Link to="/payshield">Open PayShield <ArrowRight aria-hidden /></Link>
      </Button>
    </section>
  );
}
