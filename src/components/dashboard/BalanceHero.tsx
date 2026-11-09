import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface BalanceHeroProps {
  loading?: boolean;
  monthLabel: string;
  balanceText: string;
  carriedText?: string;
  /** income minus expenses this month, already formatted without sign */
  netText: string;
  netPositive: boolean;
}

/** The one deliberately heavy element on the dashboard: current balance, large and unmistakable. */
export function BalanceHero({ loading, monthLabel, balanceText, carriedText, netText, netPositive }: BalanceHeroProps) {
  const FlowIcon = netPositive ? TrendingUp : TrendingDown;
  return (
    <section aria-labelledby="balance-label" className="flex min-h-[200px] flex-col justify-between rounded-xl border border-white/10 bg-[#101828] p-5 text-white shadow-card sm:p-6">
      <div>
        <p id="balance-label" className="text-sm font-medium text-white/70">Balance, {monthLabel}</p>
        {loading ? (
          <Skeleton className="mt-3 h-12 w-56 bg-white/10" />
        ) : (
          <p className="stat-amount mt-2 break-words text-4xl font-semibold sm:text-5xl">{balanceText}</p>
        )}
        {!loading && carriedText && <p className="mt-2 text-sm text-white/70">Includes {carriedText} carried over from earlier months.</p>}
      </div>
      <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4 text-sm">
        {loading ? (
          <Skeleton className="h-5 w-40 bg-white/10" />
        ) : (
          <>
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${netPositive ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>
              <FlowIcon className="h-4 w-4" aria-hidden />
            </span>
            <p>
              <span className="text-white/70">Cash flow this month </span>
              <span className="stat-amount font-semibold">{netPositive ? "+" : "−"}{netText}</span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
