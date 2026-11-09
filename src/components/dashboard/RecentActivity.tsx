import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import { CategoryIcon } from "@/components/CategoryIcon";
import { getCategoryByValue } from "@/lib/categoryConfig";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Transaction } from "@/hooks/useTransactions";

export function RecentActivity({ transactions }: { transactions: Transaction[] }) {
  const { format: formatCurr } = useCurrency();
  const items = transactions.slice(0, 6);

  return (
    <section aria-labelledby="recent-title" className="surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-title" className="font-heading text-base font-semibold">Recent activity</h2>
        <Link to="/transactions" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Transactions you add will appear here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((t) => {
            const cat = getCategoryByValue(t.category);
            const income = t.type === "income";
            return (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <CategoryIcon category={t.category} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.custom_category || cat?.label || t.category}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.description || (t.payment_method ?? "").replace("_", " ") || "No note"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`stat-amount text-sm font-semibold ${income ? "text-success" : ""}`}>
                    <span className="sr-only">{income ? "Income " : "Expense "}</span>{income ? "+" : "−"}{formatCurr(Number(t.amount))}
                  </p>
                  <p className="text-xs text-muted-foreground">{format(parseISO(t.date), "d MMM")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
