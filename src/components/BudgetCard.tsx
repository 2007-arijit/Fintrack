import { getCategoryByValue } from "@/lib/categoryConfig";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BudgetCardProps {
  category: string;
  budgetAmount: number;
  spentAmount: number;
  onDelete?: () => void;
}

export function BudgetCard({ category, budgetAmount, spentAmount, onDelete }: BudgetCardProps) {
  const { format } = useCurrency();
  const cat = getCategoryByValue(category);
  const rawPercent = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
  const percent = Math.min(rawPercent, 100);
  const isOver = spentAmount > budgetAmount;
  const isTight = rawPercent >= 90;

  const tone = isOver ? "text-destructive" : isTight ? "text-warning" : "text-success";
  const bar = isOver ? "bg-destructive" : isTight ? "bg-warning" : "bg-primary";

  return (
    <div className="glass-card group relative p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary/70 text-lg"
            aria-hidden="true"
          >
            {cat?.emoji || "📝"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{cat?.label || category}</p>
            <p className="text-[11px] text-muted-foreground">Monthly budget</p>
          </div>
        </div>

        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="-mr-1 -mt-1 h-8 w-8 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            onClick={onDelete}
            aria-label={`Delete ${cat?.label || category} budget`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-2">
        <p className={cn("stat-amount text-xl", isOver ? "text-destructive" : "text-foreground")}>
          {format(spentAmount)}
        </p>
        <p className="text-xs text-muted-foreground">of {format(budgetAmount)}</p>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("bar-grow h-full rounded-full", bar)}
          style={{ width: `${Math.max(percent, rawPercent > 0 ? 2 : 0)}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className={tone}>{rawPercent.toFixed(0)}% used</span>
        <span className="text-muted-foreground">
          {isOver
            ? `${format(spentAmount - budgetAmount)} over`
            : `${format(budgetAmount - spentAmount)} left`}
        </span>
      </div>

      {isTight && (
        <p className={cn("mt-3 flex items-center gap-1.5 text-[11px]", tone)}>
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {isOver ? "Budget exceeded for this month" : "Close to the monthly limit"}
        </p>
      )}
    </div>
  );
}
