import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AmountState } from "@/lib/ledgerState";

interface Props {
  state: AmountState;
  /** Only read when state === "ready". */
  value: number | undefined;
  format: (n: number) => string;
  className?: string;
  /** Tailwind width of the placeholder, matched to the typical final amount. */
  skeletonClassName?: string;
}

/**
 * The only way a group financial figure is rendered. It never prints ₹0, NaN,
 * undefined or a previous value: anything that is not a confirmed, current number
 * becomes a skeleton (loading / invalidated) or an explicit "Unavailable" (failed).
 */
export function FinancialAmount({ state, value, format, className, skeletonClassName = "w-20" }: Props) {
  if (state === "ready" && typeof value === "number" && Number.isFinite(value)) {
    return <span className={className}>{format(value)}</span>;
  }
  if (state === "error" || (state === "ready" && !(typeof value === "number" && Number.isFinite(value)))) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Unavailable</span>;
  }
  return (
    <Skeleton
      role="status"
      aria-busy="true"
      aria-label="Calculating amount"
      data-testid="amount-skeleton"
      className={cn("inline-block h-4 align-middle", skeletonClassName)}
    />
  );
}
