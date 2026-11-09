import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  /** Only pass when real comparison data exists. */
  trend?: { value: number; label: string };
  variant?: "default" | "income" | "expense" | "receivable" | "payable";
  subtitle?: string;
  loading?: boolean;
  onClick?: () => void;
}

// Colour tints the icon tile only. The figure itself stays high-contrast foreground.
const tile: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "bg-primary/10 text-primary",
  income: "bg-success/10 text-success",
  expense: "bg-destructive/10 text-destructive",
  receivable: "bg-teal/10 text-teal",
  payable: "bg-warning/10 text-warning",
};

export function StatCard({ title, value, icon: Icon, trend, variant = "default", subtitle, loading, onClick }: StatCardProps) {
  if (loading) {
    return (
      <div className="surface p-4 sm:p-5" aria-busy="true">
        <Skeleton className="mb-3 h-4 w-20" />
        <Skeleton className="mb-2 h-7 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  const body = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <span className={`rounded-lg p-2 ${tile[variant]}`}><Icon className="h-4 w-4" aria-hidden /></span>
      </div>
      <p className="stat-amount truncate text-xl font-semibold sm:text-2xl">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      {trend && (
        <p className={`mt-1 flex items-center gap-1 text-xs ${trend.value >= 0 ? "text-success" : "text-destructive"}`}>
          {trend.value >= 0 ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
          {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </>
  );

  // Clickable cards are real buttons so they are reachable and operable by keyboard.
  return onClick ? (
    <button type="button" onClick={onClick} className="surface surface-interactive block w-full p-4 text-left sm:p-5">
      {body}
    </button>
  ) : (
    <div className="surface p-4 sm:p-5">{body}</div>
  );
}
