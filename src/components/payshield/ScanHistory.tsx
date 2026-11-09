import { useMemo, useState } from "react";
import { format } from "date-fns";
import { History, RotateCw, Trash2 } from "lucide-react";
import ScanTrends from "@/components/payshield/ScanTrends";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { RISK_META, type RiskLevel } from "@/lib/payshieldRisk";
import type { ScanResult } from "@/lib/payshieldEngine";

const KIND_LABEL = { message: "Message", url: "Website link", upi: "UPI ID" } as const;
const FILTERS: Array<{ value: "all" | RiskLevel; label: string }> = [
  { value: "all", label: "All" }, { value: "high", label: "High risk" }, { value: "medium", label: "Caution" }, { value: "low", label: "No warning signs" },
];

interface Props {
  scans: ScanResult[];
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (scan: ScanResult) => void;
  onClear: () => void;
  selectedId?: string;
}

export default function ScanHistory({ scans, loading, error, refreshing, onRefresh, onSelect, onClear, selectedId }: Props) {
  const [filter, setFilter] = useState<"all" | RiskLevel>("all");
  const shown = useMemo(() => (filter === "all" ? scans : scans.filter((s) => s.risk === filter)), [scans, filter]);

  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="ps-history">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <History className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="ps-history" className="font-heading text-base font-semibold">Your scan history</h2>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onRefresh} loading={refreshing} aria-label="Refresh scan history">
            {!refreshing && <RotateCw />} Refresh
          </Button>
          {scans.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground hover:text-destructive">
              <Trash2 /> Clear
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading scan history">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : error ? (
        <ErrorState title="Couldn't load your scan history"
          description="This can happen if the PayShield database migration hasn't been applied or you're offline. Your new checks still run."
          onRetry={onRefresh} retrying={refreshing} />
      ) : scans.length === 0 ? (
        <EmptyState compact icon={History} title="No scans yet" description="Each check you run is saved here, visible only to you." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            {scans.length > 1 ? (
              <ScanTrends scans={scans.map((h) => ({ id: h.id, ts: h.ts, score: h.score, risk: h.risk, preview: h.preview, kind: h.kind }))}
                onSelect={(id) => { const hit = scans.find((s) => s.id === id); if (hit) onSelect(hit); }} />
            ) : (
              <p className="text-sm text-muted-foreground">Run one more check to see how your scans compare over time.</p>
            )}
          </div>
          <div>
            <div role="group" aria-label="Filter by risk level" className="mb-3 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${filter === f.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No scans match this filter.</p>
            ) : (
              <ul className="divide-y divide-border">
                {shown.slice(0, 8).map((scan) => (
                  <li key={scan.id}>
                    <button type="button" onClick={() => onSelect(scan)} aria-current={selectedId === scan.id}
                      className={`flex w-full flex-col gap-1.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent ${selectedId === scan.id ? "bg-accent" : ""}`}>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={RISK_META[scan.risk].tone}>{RISK_META[scan.risk].label}</StatusBadge>
                        <span className="text-xs text-muted-foreground">{scan.aiState === "ok" ? "AI reviewed" : "Rules only"}</span>
                      </span>
                      <span className="truncate text-sm font-medium">{scan.preview || "Empty scan"}</span>
                      <span className="text-xs text-muted-foreground">{KIND_LABEL[scan.kind]}, {format(new Date(scan.createdAt), "d MMM yyyy, h:mm a")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
