import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: "default" | "income" | "expense" | "receivable" | "payable";
  subtitle?: string;
  loading?: boolean;
  onClick?: () => void;
  size?: "hero" | "lg" | "md";
  className?: string;
}

const variantStyles: Record<
  NonNullable<StatCardProps["variant"]>,
  { icon: string; value: string; glyph: string }
> = {
  default: { icon: "text-primary bg-primary/10", value: "text-foreground", glyph: "text-primary/10" },
  income: { icon: "text-success bg-success/10", value: "text-foreground", glyph: "text-success/10" },
  expense: { icon: "text-destructive bg-destructive/10", value: "text-foreground", glyph: "text-destructive/10" },
  receivable: { icon: "text-success bg-success/10", value: "text-foreground", glyph: "text-success/10" },
  payable: { icon: "text-destructive bg-destructive/10", value: "text-foreground", glyph: "text-destructive/10" },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  variant = "default",
  subtitle,
  loading,
  onClick,
  size = "md",
  className,
}: StatCardProps) {
  const isHero = size === "hero";
  const isLg = size === "lg";

  if (loading) {
    return (
      <div className={cn(isHero ? "surface-elevated p-6" : "glass-card p-4", className)}>
        <Skeleton className="mb-3 h-3 w-20" />
        <Skeleton className={cn("mb-2", isHero ? "h-11 w-44" : "h-7 w-28")} />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  const v = variantStyles[variant];
  const TrendIcon = trend && trend.value >= 0 ? TrendingUp : TrendingDown;
  const interactive = Boolean(onClick);

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        isHero ? "surface-elevated" : "glass-card",
        interactive && "card-interactive cursor-pointer focus-visible:outline-none",
        isHero ? "p-6" : isLg ? "p-5" : "p-4",
        "relative overflow-hidden",
        className,
      )}
    >
      {isHero && (
        <Icon
          aria-hidden="true"
          className={cn("pointer-events-none absolute -bottom-4 -right-3 h-32 w-32", v.glyph)}
          strokeWidth={1.25}
        />
      )}

      <div className="relative flex items-center justify-between gap-3">
        <span className={cn("eyebrow", isHero && "text-muted-foreground/90")}>{title}</span>
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", v.icon)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <p
        className={cn(
          "relative mt-3 stat-amount",
          isHero
            ? "display-amount text-[2.5rem] sm:text-5xl text-foreground"
            : isLg
              ? "text-[1.75rem] tracking-tight text-foreground"
              : "text-[1.35rem] tracking-tight text-foreground",
          v.value,
        )}
      >
        {value}
      </p>

      {(subtitle || trend) && (
        <div className="relative mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          {subtitle && <span className="text-xs leading-snug text-muted-foreground">{subtitle}</span>}
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                trend.value >= 0 ? "text-success" : "text-destructive",
              )}
            >
              <TrendIcon className="h-3 w-3" aria-hidden="true" />
              {trend.value >= 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
