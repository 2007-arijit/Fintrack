import { CategoryIcon, CategoryLabel, PaymentLabel } from "@/components/CategoryIcon";
import { useState, useMemo, useEffect } from "react";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { TransactionModal } from "@/components/TransactionModal";
import { SmartImportModal } from "@/components/SmartImportModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { getCategoryByValue, ALL_CATEGORIES, PAYMENT_METHODS } from "@/lib/categoryConfig";
import { exportTransactionsToCSV } from "@/lib/csvExport";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Download, Upload, Trash2, Search, Pencil, Lock } from "lucide-react";

const PAGE_SIZE = 15;

export default function Transactions() {
  const { transactions, isLoading, addTransaction, updateTransaction, deleteTransaction, bulkDelete } =
    useTransactions();
  const { format: formatCurr } = useCurrency();

  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const handler = () => setShowAdd(true);
    window.addEventListener("floating-add-click", handler);
    return () => window.removeEventListener("floating-add-click", handler);
  }, []);

  const filtered = useMemo(() => {
    let result = [...transactions];
    if (typeFilter !== "all") result = result.filter((t) => t.type === typeFilter);
    if (categoryFilter !== "all") result = result.filter((t) => t.category === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description?.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.custom_category?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortBy === "date") return mul * (new Date(a.date).getTime() - new Date(b.date).getTime());
      return mul * (Number(a.amount) - Number(b.amount));
    });
    return result;
  }, [transactions, typeFilter, categoryFilter, search, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    setSelected(selected.size === paged.length ? new Set() : new Set(paged.map((t) => t.id)));
  };
  const isDebtAuto = (t: Transaction) => t.source === "debt_auto";

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 w-full">
        <h1 className="font-heading font-bold text-2xl truncate flex-1 min-w-0">Transactions</h1>
        {selected.size > 0 && (
          <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setShowBulkDelete(true)}>
            <Trash2 className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Delete ({selected.size})</span>
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search transactions..."
          className="pl-9 bg-secondary border-border w-full"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border max-h-60">
            <SelectItem value="all">All Categories</SelectItem>
            {ALL_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}><CategoryLabel category={c.value} label={c.label} /></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sort + Actions */}
      <div className="flex items-center gap-2">
        <Select
          value={`${sortBy}-${sortDir}`}
          onValueChange={(v) => { const [s, d] = v.split("-"); setSortBy(s as "date" | "amount"); setSortDir(d as "asc" | "desc"); }}
        >
          <SelectTrigger className="flex-1 min-w-0 h-11 bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="date-desc">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="amount-desc">Highest Amount</SelectItem>
            <SelectItem value="amount-asc">Lowest Amount</SelectItem>
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="h-11 w-11 p-0 rounded-[10px] border-border shrink-0" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import (CSV / PDF / Image)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="h-11 w-11 p-0 rounded-[10px] border-border shrink-0" onClick={() => exportTransactionsToCSV(filtered)}>
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export CSV</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="h-11 w-11 p-0 rounded-[10px] bg-primary hover:bg-primary/90 shrink-0" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add Transaction</TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description={search || typeFilter !== "all" ? "Try adjusting your filters" : "Add your first transaction to get started"}
          actionLabel={!search ? "Add Transaction" : undefined}
          onAction={!search ? () => setShowAdd(true) : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="glass-card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="p-3 text-left w-10">
                      <Checkbox checked={selected.size === paged.length && paged.length > 0} onCheckedChange={toggleAll} />
                    </th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Category</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-left">Method</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((t) => {
                    const cat = getCategoryByValue(t.category);
                    const pm = PAYMENT_METHODS.find((p) => p.value === t.payment_method);
                    const locked = isDebtAuto(t);
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                        <td className="p-3"><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} /></td>
                        <td className="p-3 whitespace-nowrap">{format(parseISO(t.date), "MMM dd, yyyy")}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5">
                            <CategoryLabel category={locked ? "debt_payment" : t.category} label={t.custom_category || cat?.label || t.category} />
                            {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground truncate max-w-[200px]">{t.description || "—"}</td>
                        <td className="p-3 text-muted-foreground">{pm ? <PaymentLabel method={pm.value} label={pm.label} /> : t.payment_method}</td>
                        <td className={`p-3 text-right font-medium ${t.type === "income" ? "text-success" : "text-destructive"}`}>
                          {t.type === "income" ? "+" : "-"}{formatCurr(Number(t.amount))}
                        </td>
                        <td className="p-3 text-right">
                          {locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className="h-3.5 w-3.5 text-muted-foreground inline cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>Managed via Debt Tracker</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditTx(t)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {paged.map((t) => {
              const cat = getCategoryByValue(t.category);
              const locked = isDebtAuto(t);
              return (
                <div key={t.id} className="glass-card p-3 flex items-center gap-3">
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                  <CategoryIcon category={locked ? "debt_payment" : t.category} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate">{t.custom_category || cat?.label || t.category}</p>
                      {locked && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{format(parseISO(t.date), "MMM dd")}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-semibold ${t.type === "income" ? "text-success" : "text-destructive"}`}>
                      {t.type === "income" ? "+" : "-"}{formatCurr(Number(t.amount))}
                    </p>
                  </div>
                  {!locked && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditTx(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="border-border">Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="border-border">Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <TransactionModal open={showAdd} onOpenChange={setShowAdd} onSubmit={(data) => addTransaction.mutate(data)} loading={addTransaction.isPending} />

      {editTx && (
        <TransactionModal
          open={!!editTx}
          onOpenChange={(o) => !o && setEditTx(null)}
          defaultValues={editTx}
          onSubmit={(data) => updateTransaction.mutate({ id: editTx.id, ...data })}
          loading={updateTransaction.isPending}
        />
      )}

      <ConfirmDialog
        open={showBulkDelete}
        onOpenChange={setShowBulkDelete}
        title="Delete Transactions"
        description={`Are you sure you want to delete ${selected.size} transaction(s)? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          bulkDelete.mutate([...selected]);
          setSelected(new Set());
          setShowBulkDelete(false);
        }}
      />

      <SmartImportModal open={showImport} onOpenChange={setShowImport} />
    </div>
  );
}
