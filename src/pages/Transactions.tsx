import { useState, useMemo, useEffect } from "react";
import { useTransactions, Transaction } from "@/hooks/useTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { TransactionModal } from "@/components/TransactionModal";
import { SmartImportModal } from "@/components/SmartImportModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getCategoryByValue, ALL_CATEGORIES, PAYMENT_METHODS } from "@/lib/categoryConfig";
import { exportTransactionsToCSV } from "@/lib/csvExport";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  subDays,
  startOfDay,
  startOfYear,
  isWithinInterval,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  Download,
  Upload,
  Trash2,
  Search,
  Pencil,
  Lock,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "all" | "this_month" | "last_month" | "last_90" | "this_year";
type SortKey = "newest" | "oldest" | "highest" | "lowest";

const PAGE_SIZE = 20;

const PERIODS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_90", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "highest", label: "Highest amount" },
  { value: "lowest", label: "Lowest amount" },
];

/**
 * Transactions written by the debt tracker or split settlements are the
 * bookkeeping half of another record. Editing or deleting them here would
 * desynchronise that record, so they are read-only and point to their source.
 */
function isManagedElsewhere(t: Transaction) {
  return (
    t.source === "debt_auto" ||
    Boolean(t.debt_id) ||
    t.category.startsWith("group_settlement")
  );
}

function managedReason(t: Transaction) {
  return t.source === "debt_auto" || t.debt_id
    ? "Managed in Debt Tracker"
    : "Managed in Split";
}

function methodLabel(value?: string | null) {
  if (!value) return "—";
  const method = PAYMENT_METHODS.find((m) => m.value === value);
  return method ? `${method.emoji} ${method.label}` : value;
}

export default function Transactions() {
  const { transactions, isLoading, addTransaction, updateTransaction, deleteTransaction, bulkDelete } =
    useTransactions();
  const { format: formatCurr } = useCurrency();

  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "income" | "expense">("all");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState<Period>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  useEffect(() => {
    const handler = () => setShowAdd(true);
    window.addEventListener("floating-add-click", handler);
    return () => window.removeEventListener("floating-add-click", handler);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, type, category, period, sort]);

  const categoryOptions = useMemo(
    () => (type === "all" ? ALL_CATEGORIES : ALL_CATEGORIES.filter((c) => c.type === type)),
    [type],
  );

  const interval = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "this_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month": {
        const last = subMonths(now, 1);
        return { start: startOfMonth(last), end: endOfMonth(last) };
      }
      case "last_90":
        return { start: startOfDay(subDays(now, 89)), end: now };
      case "this_year":
        return { start: startOfYear(now), end: now };
      default:
        return null;
    }
  }, [period]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const rows = transactions.filter((t) => {
      if (type !== "all" && t.type !== type) return false;
      if (category !== "all" && t.category !== category) return false;

      if (interval && !isWithinInterval(parseISO(t.date), interval)) return false;

      if (query) {
        const cat = getCategoryByValue(t.category);
        const haystack = [
          t.description,
          t.custom_category,
          cat?.label,
          t.category,
          t.payment_method,
          String(t.amount),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    return rows.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);
        case "highest":
          return Number(b.amount) - Number(a.amount);
        case "lowest":
          return Number(a.amount) - Number(b.amount);
        default:
          return b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at);
      }
    });
  }, [transactions, type, category, interval, search, sort]);

  const totals = useMemo(() => {
    const income = filtered
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = filtered
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return { income, expense, net: income - expense };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const selectedVisible = filtered.filter((t) => selected.has(t.id) && !isManagedElsewhere(t));
  const selectedCount = selectedVisible.length;
  const selectableOnPage = paged.filter((t) => !isManagedElsewhere(t));
  const allOnPageSelected =
    selectableOnPage.length > 0 && selectableOnPage.every((t) => selected.has(t.id));

  const activeFilters =
    (type !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (period !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const selectable = paged.filter((t) => !isManagedElsewhere(t));
      if (allOnPageSelected) selectable.forEach((t) => next.delete(t.id));
      else selectable.forEach((t) => next.add(t.id));
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setType("all");
    setCategory("all");
    setPeriod("all");
  }

  function exportRows(items: Transaction[]) {
    exportTransactionsToCSV(
      items.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        category: t.category,
        custom_category: t.custom_category,
        description: t.description,
        date: t.date,
        payment_method: t.payment_method,
      })),
      `fintrack-transactions-${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
  }

  function handleSubmit(data: Parameters<typeof addTransaction.mutate>[0]) {
    if (editing) {
      updateTransaction.mutate({ id: editing.id, ...data });
      setEditing(null);
    } else {
      addTransaction.mutate(data);
    }
  }

  function confirmDelete() {
    if (deleteId) deleteTransaction.mutate(deleteId);
    setDeleteId(null);
  }

  function confirmBulkDelete() {
    bulkDelete.mutate(
      selectedVisible.map((t) => t.id),
      { onSettled: () => setSelected(new Set()) },
    );
    setConfirmBulk(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description="Every movement in one readable place. Filter it down, fix a detail, or export the record."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border bg-card/40"
              onClick={() => setShowImport(true)}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-border bg-card/40"
              onClick={() => exportRows(filtered)}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </>
        }
      />

      {/* Filtered totals — one strip, not three competing cards. */}
      <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card">
        <div className="p-3.5 sm:p-4">
          <p className="eyebrow text-[10px]">Income</p>
          <p className="stat-amount mt-1 text-sm text-success sm:text-base">+{formatCurr(totals.income)}</p>
        </div>
        <div className="p-3.5 sm:p-4">
          <p className="eyebrow text-[10px]">Expense</p>
          <p className="stat-amount mt-1 text-sm text-foreground sm:text-base">{formatCurr(totals.expense)}</p>
        </div>
        <div className="p-3.5 sm:p-4">
          <p className="eyebrow text-[10px]">Net</p>
          <p
            className={cn(
              "stat-amount mt-1 text-sm sm:text-base",
              totals.net >= 0 ? "text-foreground" : "text-destructive",
            )}
          >
            {totals.net >= 0 ? "+" : ""}
            {formatCurr(totals.net)}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="glass-card p-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, category or amount…"
              aria-label="Search transactions"
              className="h-9 border-border bg-secondary/40 pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex xl:items-center">
            <Select
              value={type}
              onValueChange={(value) => {
                setType(value as "all" | "income" | "expense");
                setCategory("all");
              }}
            >
              <SelectTrigger className="h-9 w-full border-border bg-secondary/40 xl:w-[118px]" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>

            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-full border-border bg-secondary/40 xl:w-[168px]" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64 border-border bg-card">
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.emoji} {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
              <SelectTrigger className="h-9 w-full border-border bg-secondary/40 xl:w-[138px]" aria-label="Filter by date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
              <SelectTrigger className="h-9 w-full border-border bg-secondary/40 xl:w-[150px]" aria-label="Sort transactions">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                {SORTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeFilters > 0 && (
          <div className="mt-2 flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">
              {activeFilters} {activeFilters === 1 ? "filter" : "filters"} active
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear
            </button>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2">
          <span className="text-sm font-medium text-foreground">
            {selectedCount} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-border bg-card/50"
              onClick={() => exportRows(selectedVisible)}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1.5"
              onClick={() => setConfirmBulk(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              aria-label="Clear selection"
              onClick={() => setSelected(new Set())}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass-card">
          {transactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Add your first transaction, or import a CSV or statement to get started."
              actionLabel="Add Transaction"
              onAction={() => setShowAdd(true)}
            />
          ) : (
            <EmptyState
              title="No matches"
              description="Nothing fits these filters. Try a broader date range, a different type, or clear the search."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-11 px-4 py-3">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleAllOnPage}
                      aria-label="Select all transactions on this page"
                    />
                  </th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Date
                  </th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Transaction
                  </th>
                  <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Method
                  </th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Amount
                  </th>
                  <th className="w-24 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {paged.map((t) => {
                  const cat = getCategoryByValue(t.category);
                  const locked = isManagedElsewhere(t);
                  const income = t.type === "income";
                  return (
                    <tr key={t.id} className="tx-row border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 align-middle">
                        {locked ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="grid h-4 w-4 place-items-center text-muted-foreground/60">
                                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{managedReason(t)}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Checkbox
                            checked={selected.has(t.id)}
                            onCheckedChange={() => toggleSelected(t.id)}
                            aria-label={`Select ${t.description || cat?.label || "transaction"}`}
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {format(parseISO(t.date), "d MMM yyyy")}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary/70 text-sm"
                            aria-hidden="true"
                          >
                            {cat?.emoji || "📝"}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {t.custom_category || cat?.label || t.category}
                            </p>
                            {t.description && (
                              <p className="truncate text-xs text-muted-foreground">{t.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                        {methodLabel(t.payment_method)}
                      </td>
                      <td
                        className={cn(
                          "stat-amount whitespace-nowrap px-3 py-3 text-right",
                          income ? "text-success" : "text-foreground",
                        )}
                      >
                        {income ? "+" : "−"}
                        {formatCurr(Number(t.amount))}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="grid h-8 w-8 place-items-center text-muted-foreground/50">
                                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{managedReason(t)}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditing(t)}
                                aria-label="Edit transaction"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteId(t.id)}
                                aria-label="Delete transaction"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-border/60 md:hidden">
            {paged.map((t) => {
              const cat = getCategoryByValue(t.category);
              const locked = isManagedElsewhere(t);
              const income = t.type === "income";
              return (
                <div key={t.id} className="p-4">
                  <div className="flex items-start gap-3">
                    {locked ? (
                      <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center text-muted-foreground/60">
                        <Lock className="h-3.5 w-3.5" aria-label={managedReason(t)} />
                      </span>
                    ) : (
                      <Checkbox
                        checked={selected.has(t.id)}
                        onCheckedChange={() => toggleSelected(t.id)}
                        aria-label={`Select ${t.description || cat?.label || "transaction"}`}
                        className="mt-1 shrink-0"
                      />
                    )}
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/70 text-base"
                      aria-hidden="true"
                    >
                      {cat?.emoji || "📝"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {t.custom_category || cat?.label || t.category}
                        </p>
                        <p
                          className={cn(
                            "stat-amount shrink-0 text-sm",
                            income ? "text-success" : "text-foreground",
                          )}
                        >
                          {income ? "+" : "−"}
                          {formatCurr(Number(t.amount))}
                        </p>
                      </div>
                      {t.description && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{format(parseISO(t.date), "d MMM yyyy")}</span>
                        <span aria-hidden="true">·</span>
                        <span>{methodLabel(t.payment_method)}</span>
                        {locked && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{managedReason(t)}</span>
                          </>
                        )}
                      </div>
                      {!locked && (
                        <div className="mt-2 flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                            onClick={() => setEditing(t)}
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(t.id)}
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing <span className="tabular text-foreground">{pageStart + 1}</span>–
              <span className="tabular text-foreground">{Math.min(pageStart + PAGE_SIZE, filtered.length)}</span> of{" "}
              <span className="tabular text-foreground">{filtered.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular min-w-12 text-center text-xs text-muted-foreground">
                {safePage} / {totalPages}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <TransactionModal
        key={editing?.id ?? "new"}
        open={showAdd || Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setShowAdd(false);
            setEditing(null);
          }
        }}
        defaultValues={editing ?? undefined}
        onSubmit={handleSubmit}
        loading={addTransaction.isPending || updateTransaction.isPending}
      />

      <SmartImportModal open={showImport} onOpenChange={setShowImport} />

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete this transaction?"
        description="The record will be removed from your ledger. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Delete ${selectedCount} transactions?`}
        description="These records will be removed from your ledger. This cannot be undone."
        confirmLabel="Delete all"
        destructive
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
