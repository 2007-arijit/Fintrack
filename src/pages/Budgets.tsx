import { useMemo, useState } from "react";
import { useBudgets } from "@/hooks/useBudgets";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { BudgetCard } from "@/components/BudgetCard";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryDropdown } from "@/components/CategoryDropdown";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseISO } from "date-fns";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function Budgets() {
  const now = new Date();
  const [month] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const { budgets, isLoading, upsertBudget, deleteBudget } = useBudgets(month, year);
  const { transactions } = useTransactions();
  const { format: formatCurr } = useCurrency();

  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const spentByCategory = useMemo(
    () =>
      transactions
        .filter(
          (t) =>
            t.type === "expense" &&
            parseISO(t.date).getMonth() + 1 === month &&
            parseISO(t.date).getFullYear() === year,
        )
        .reduce<Record<string, number>>((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
          return acc;
        }, {}),
    [transactions, month, year],
  );

  const summary = useMemo(() => {
    const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
    const budgetedSpent = budgets.reduce((sum, b) => sum + (spentByCategory[b.category] || 0), 0);
    const percent = totalBudget > 0 ? (budgetedSpent / totalBudget) * 100 : 0;
    return {
      totalBudget,
      budgetedSpent,
      remaining: totalBudget - budgetedSpent,
      percent,
    };
  }, [budgets, spentByCategory]);

  const overBudgetCount = budgets.filter((b) => (spentByCategory[b.category] || 0) > Number(b.amount)).length;
  const isOver = summary.remaining < 0;

  const handleAdd = () => {
    if (!newCategory || !newAmount || Number(newAmount) <= 0) return;
    upsertBudget.mutate({ category: newCategory, amount: Number(newAmount), month, year });
    setShowAdd(false);
    setNewCategory("");
    setNewAmount("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${MONTHS[month - 1]} ${year}`}
        title="Budgets"
        description="A monthly ceiling for the categories that matter. Set it once, then let the ledger do the counting."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add budget
          </Button>
        }
      />

      {budgets.length > 0 && (
        <section className="glass-card p-5 sm:p-6" aria-label="Budget summary">
          <div className="grid gap-6 md:grid-cols-[1.35fr_1fr] md:items-end">
            <div className="min-w-0">
              <p className="eyebrow">Allocated this month</p>
              <p className="stat-amount mt-2 text-3xl text-foreground">{formatCurr(summary.totalBudget)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatCurr(summary.budgetedSpent)} spent across {budgets.length}{" "}
                {budgets.length === 1 ? "category" : "categories"}
                {overBudgetCount > 0 && (
                  <span className="text-destructive"> · {overBudgetCount} over</span>
                )}
              </p>

              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("bar-grow h-full rounded-full", isOver ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${Math.min(Math.max(summary.percent, 2), 100)}%` }}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-4 md:border-l md:border-border/70 md:pl-8">
              <div>
                <dt className="eyebrow text-[10px]">Remaining</dt>
                <dd
                  className={cn(
                    "stat-amount mt-1 text-lg",
                    isOver ? "text-destructive" : "text-foreground",
                  )}
                >
                  {formatCurr(Math.abs(summary.remaining))}
                  {isOver && <span className="ml-1 text-xs font-normal text-destructive">over</span>}
                </dd>
              </div>
              <div>
                <dt className="eyebrow text-[10px]">Used</dt>
                <dd className="stat-amount mt-1 text-lg text-foreground">
                  {summary.percent.toFixed(0)}%
                </dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {budgets.length === 0 && !isLoading ? (
        <div className="glass-card">
          <EmptyState
            title="No budgets set"
            description="Set monthly budgets for expense categories to track your spending."
            actionLabel="Add Budget"
            onAction={() => setShowAdd(true)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              category={b.category}
              budgetAmount={Number(b.amount)}
              spentAmount={spentByCategory[b.category] || 0}
              onDelete={() => setDeleteId(b.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading">Set a monthly budget</DialogTitle>
            <DialogDescription>
              Choose a category and the most you want to spend on it in {MONTHS[month - 1]}. Adding the same
              category again updates the existing limit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategoryDropdown type="expense" value={newCategory} onChange={setNewCategory} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-amount">Budget amount</Label>
              <Input
                id="budget-amount"
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="border-border bg-secondary/40"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <Button
              onClick={handleAdd}
              className="w-full"
              disabled={upsertBudget.isPending || !newCategory || !newAmount}
            >
              {upsertBudget.isPending ? "Saving…" : "Save budget"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this budget?"
        description="The monthly limit will be removed. Your transactions and spending history stay untouched."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteId) deleteBudget.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
