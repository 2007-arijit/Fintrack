import { useState } from "react";
import { useBudgets } from "@/hooks/useBudgets";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { BudgetCard } from "@/components/BudgetCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryDropdown } from "@/components/CategoryDropdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { parseISO } from "date-fns";
import { Plus } from "lucide-react";

export default function Budgets() {
  const now = new Date();
  const [month] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const { budgets, isLoading, upsertBudget } = useBudgets(month, year);
  const { transactions } = useTransactions();
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const spentByCategory = transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        parseISO(t.date).getMonth() + 1 === month &&
        parseISO(t.date).getFullYear() === year
    )
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + Number(t.amount);
      return acc;
    }, {});

  const handleAdd = () => {
    if (!newCategory || !newAmount || Number(newAmount) <= 0) return;
    upsertBudget.mutate({ category: newCategory, amount: Number(newAmount), month, year });
    setShowAdd(false);
    setNewCategory("");
    setNewAmount("");
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl">Budgets</h1>
          <p className="text-sm text-muted-foreground">{MONTHS[month - 1]} {year}</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Budget
        </Button>
      </div>

      {budgets.length === 0 && !isLoading ? (
        <EmptyState
          title="No budgets set"
          description="Set monthly budgets for expense categories to track your spending."
          actionLabel="Add Budget"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              category={b.category}
              budgetAmount={Number(b.amount)}
              spentAmount={spentByCategory[b.category] || 0}
            />
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Set Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <CategoryDropdown type="expense" value={newCategory} onChange={setNewCategory} />
            </div>
            <div>
              <Label>Budget Amount</Label>
              <Input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="bg-secondary border-border"
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
              {upsertBudget.isPending ? "Saving..." : "Save Budget"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
