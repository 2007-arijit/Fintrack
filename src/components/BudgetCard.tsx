import { CategoryIcon } from "@/components/CategoryIcon";
import { Progress } from "@/components/ui/progress";
import { getCategoryByValue } from "@/lib/categoryConfig";
import { useCurrency } from "@/contexts/CurrencyContext";
import { AlertTriangle } from "lucide-react";

interface BudgetCardProps {
  category: string;
  budgetAmount: number;
  spentAmount: number;
}

export function BudgetCard({ category, budgetAmount, spentAmount }: BudgetCardProps) {
  const { format } = useCurrency();
  const cat = getCategoryByValue(category);
  const percent = budgetAmount > 0 ? Math.min((spentAmount / budgetAmount) * 100, 100) : 0;
  const isOver90 = percent >= 90;
  const isOver = spentAmount > budgetAmount;

  return (
    <div className="surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CategoryIcon category={category} />
          <span className="font-medium text-sm">{cat?.label || category}</span>
        </div>
        {isOver90 && (
          <div className={`flex items-center gap-1 text-xs ${isOver ? "text-destructive" : "text-warning"}`}>
            <AlertTriangle className="h-3 w-3" />
            {isOver ? "Over budget!" : "Almost there"}
          </div>
        )}
      </div>
      <Progress value={percent} className="h-2 mb-2" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{format(spentAmount)} spent</span>
        <span>{format(budgetAmount)} budget</span>
      </div>
    </div>
  );
}
