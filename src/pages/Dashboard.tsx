import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTransactions } from "@/hooks/useTransactions";
import { useDebts } from "@/hooks/useDebts";
import { useMonthlyBalance } from "@/hooks/useMonthlyBalance";
import { useCurrency } from "@/contexts/CurrencyContext";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { TransactionModal } from "@/components/TransactionModal";
import { BuyChaiModal } from "@/components/BuyChaiModal";
const ExpenseDonut = lazy(() =>
  import("@/components/charts/ExpenseDonut").then((m) => ({ default: m.ExpenseDonut })),
);
const IncomeExpenseTrend = lazy(() =>
  import("@/components/charts/IncomeExpenseTrend").then((m) => ({ default: m.IncomeExpenseTrend })),
);
const DailySpendingChart = lazy(() =>
  import("@/components/charts/DailySpendingChart").then((m) => ({ default: m.DailySpendingChart })),
);
import { PayShieldCard } from "@/components/dashboard/PayShieldCard";
import { getCategoryByValue } from "@/lib/categoryConfig";
import {
  format,
  subMonths,
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
} from "date-fns";
import {
  TrendingDown,
  TrendingUp,
  HandCoins,
  Landmark,
  Settings,
  Coffee,
  Sun,
  Moon,
  ChevronRight,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstallAppBanner } from "@/components/layout/InstallAppBanner";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { transactions, isLoading, addTransaction } = useTransactions();
  const { totalReceivable, totalPayable } = useDebts();
  const { format: formatCurr } = useCurrency();
  const { carryForward } = useMonthlyBalance(transactions);
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showBuyChai, setShowBuyChai] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handler = () => setShowAdd(true);
    window.addEventListener("floating-add-click", handler);
    return () => window.removeEventListener("floating-add-click", handler);
  }, []);

  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  const thisMonth = useMemo(
    () =>
      transactions.filter((t) =>
        isWithinInterval(parseISO(t.date), { start: thisMonthStart, end: thisMonthEnd }),
      ),
    [transactions, thisMonthStart, thisMonthEnd],
  );

  const totalIncome = useMemo(
    () => thisMonth.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
    [thisMonth],
  );

  const totalExpense = useMemo(
    () => thisMonth.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
    [thisMonth],
  );

  const balance = carryForward + totalIncome - totalExpense;

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    thisMonth
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return Object.entries(map)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [thisMonth]);

  const trendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const date = subMonths(now, 5 - i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const monthTxns = transactions.filter((t) =>
        isWithinInterval(parseISO(t.date), { start, end }),
      );
      return {
        month: format(date, "MMM"),
        income: monthTxns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
        expense: monthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [transactions]);

  const dailySpending = useMemo(() => {
    const map: Record<string, number> = {};
    thisMonth
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        const day = format(parseISO(t.date), "dd");
        map[day] = (map[day] || 0) + Number(t.amount);
      });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, amount]) => ({ day, amount }));
  }, [thisMonth]);

  const peakSpend = useMemo(
    () => dailySpending.reduce((max, d) => Math.max(max, d.amount), 0),
    [dailySpending],
  );

  const recent = useMemo(
    () =>
      [...thisMonth]
        .sort((a, b) => {
          const byDate = b.date.localeCompare(a.date);
          return byDate !== 0 ? byDate : b.created_at.localeCompare(a.created_at);
        })
        .slice(0, 6),
    [thisMonth],
  );

  // Month-over-month comparison uses the same six-month series already computed.
  const lastMonthExpense = trendData[4]?.expense ?? 0;
  const changePct =
    lastMonthExpense > 0 ? ((totalExpense - lastMonthExpense) / lastMonthExpense) * 100 : null;
  const spendDown = changePct !== null && changePct <= 0;
  const maxTrendExpense = Math.max(...trendData.map((d) => d.expense), 1);
  const hasTrendSpend = trendData.some((d) => d.expense > 0);
  const hasTrendActivity = trendData.some((d) => d.income > 0 || d.expense > 0);

  return (
    <div className="space-y-6">
      {/* Header — the only place actions live, so the data below stays calm. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{format(now, "MMMM yyyy")}</p>
          <h1 className="page-title mt-2">Overview</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Where your money stands this month.</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add transaction
          </Button>
          <div className="flex items-center rounded-lg border border-border/70 bg-card/40 p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle dark mode"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-muted-foreground hover:text-amber-400 transition-colors"
              title="Buy Arijit Koyal a chai"
              aria-label="Buy Arijit Koyal a chai"
              onClick={() => setShowBuyChai(true)}
            >
              <Coffee className="h-4 w-4" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
              </span>
            </Button>
            <Link to="/settings" aria-label="Open settings">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <InstallAppBanner />

      {/* Hero + secondary column. Deliberately asymmetric. */}
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section
          className="surface-elevated relative flex flex-col justify-center overflow-hidden p-6 sm:p-8"
          aria-label="Current balance"
        >
          <div className="relative grid w-full gap-8 md:grid-cols-[1.35fr_1fr] md:items-center">
            <div className="min-w-0">
              <p className="eyebrow">Current balance</p>
              <p
                className={cn(
                  "display-amount mt-3 text-[2.6rem] sm:text-6xl",
                  balance < 0 ? "text-destructive" : "text-foreground",
                )}
              >
                {formatCurr(balance)}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {carryForward !== 0
                  ? `${formatCurr(carryForward)} carried from previous months, plus this month’s activity.`
                  : "Everything you’ve earned, minus everything you’ve spent."}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-5 md:border-l md:border-border/70 md:pl-8">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  Income
                </dt>
                <dd className="stat-amount mt-1.5 text-lg text-success">+{formatCurr(totalIncome)}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  Spending
                </dt>
                <dd className="stat-amount mt-1.5 text-lg text-foreground">{formatCurr(totalExpense)}</dd>
              </div>
              <div className="col-span-2 border-t border-border/70 pt-4">
                <dt className="text-xs text-muted-foreground">Net this month</dt>
                <dd
                  className={cn(
                    "stat-amount mt-1 text-sm font-medium",
                    totalIncome - totalExpense >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {totalIncome - totalExpense >= 0 ? "+" : ""}
                  {formatCurr(totalIncome - totalExpense)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="glass-card overflow-hidden">
            <button
              type="button"
              onClick={() => navigate("/debt?type=receivable")}
              className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
                <HandCoins className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">Owed to you</span>
                <span className="block text-xs text-muted-foreground">Active receivables</span>
              </span>
              <span className="stat-amount shrink-0 text-sm text-foreground">
                {formatCurr(totalReceivable)}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
            <div className="border-t border-border/70" />
            <button
              type="button"
              onClick={() => navigate("/debt?type=payable")}
              className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                <Landmark className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">You owe</span>
                <span className="block text-xs text-muted-foreground">Active payables</span>
              </span>
              <span className="stat-amount shrink-0 text-sm text-foreground">
                {formatCurr(totalPayable)}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Month over month</p>
              {changePct !== null ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    spendDown ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {spendDown ? (
                    <TrendingDown className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  )}
                  {Math.abs(changePct).toFixed(0)}%
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">New</span>
              )}
            </div>
            <p className="mt-2 text-sm leading-snug text-muted-foreground">
              {changePct === null ? (
                "Your first month of spending data."
              ) : (
                <>
                  Spending is{" "}
                  <span className={spendDown ? "font-medium text-success" : "font-medium text-foreground"}>
                    {Math.abs(changePct).toFixed(0)}% {spendDown ? "lower" : "higher"}
                  </span>{" "}
                  than {format(subMonths(now, 1), "MMMM")}.
                </>
              )}
            </p>

            {hasTrendSpend ? (
              <>
                <div className="mt-4 flex h-12 items-end gap-1.5" aria-hidden="true">
                  {trendData.map((d, i) => {
                    const current = i === trendData.length - 1;
                    const height = Math.max(6, Math.round((d.expense / maxTrendExpense) * 100));
                    return (
                      <div
                        key={`${d.month}-${i}`}
                        title={`${d.month}: ${formatCurr(d.expense)}`}
                        className={cn(
                          "bar-grow flex-1 rounded-sm",
                          current ? "bg-primary" : "bg-muted-foreground/20",
                        )}
                        style={{ height: `${height}%`, animationDelay: `${i * 45}ms` }}
                      />
                    );
                  })}
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>{trendData[0]?.month}</span>
                  <span>{trendData[trendData.length - 1]?.month}</span>
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                No spending in the last six months yet, so there is nothing to compare.
              </p>
            )}
          </div>
        </aside>
      </div>

      <PayShieldCard />

      {transactions.length === 0 && !isLoading ? (
        <EmptyState
          title="No transactions yet"
          description="Start tracking your finances by adding your first transaction."
          actionLabel="Add Transaction"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <section className="glass-card p-5 lg:col-span-5" aria-labelledby="dash-breakdown">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 id="dash-breakdown" className="text-sm font-semibold text-foreground">
                    Expense breakdown
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Where this month went</p>
                </div>
                <Link
                  to="/reports"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  Reports <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>
              {expenseByCategory.length > 0 ? (
                <Suspense
                  fallback={<div className="h-44 animate-pulse rounded-xl bg-secondary/50" aria-busy="true" />}
                >
                  <ExpenseDonut data={expenseByCategory} />
                </Suspense>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">No expenses this month</p>
              )}
            </section>

            <section className="glass-card p-5 lg:col-span-7" aria-labelledby="dash-trend">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 id="dash-trend" className="text-sm font-semibold text-foreground">
                    Six-month trend
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Income against spending</p>
                </div>
              </div>
              {hasTrendActivity ? (
                <Suspense
                  fallback={<div className="h-52 animate-pulse rounded-xl bg-secondary/50" aria-busy="true" />}
                >
                  <IncomeExpenseTrend data={trendData} />
                </Suspense>
              ) : (
                <p className="py-14 text-center text-sm text-muted-foreground">
                  Add transactions to see income and spending across the last six months.
                </p>
              )}
            </section>

            <section className="glass-card p-5 lg:col-span-7" aria-labelledby="dash-daily">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <h2 id="dash-daily" className="text-sm font-semibold text-foreground">
                    Daily spending
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">This month, day by day</p>
                </div>
                {peakSpend > 0 && (
                  <p className="text-right text-xs text-muted-foreground">
                    Peak day <span className="tabular font-medium text-foreground">{formatCurr(peakSpend)}</span>
                  </p>
                )}
              </div>
              {dailySpending.length > 0 ? (
                <Suspense
                  fallback={<div className="h-56 animate-pulse rounded-xl bg-secondary/50" aria-busy="true" />}
                >
                  <DailySpendingChart data={dailySpending} />
                </Suspense>
              ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No spending data this month
                </p>
              )}
            </section>

            <section className="glass-card p-5 lg:col-span-5" aria-labelledby="dash-recent">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h2 id="dash-recent" className="text-sm font-semibold text-foreground">
                    Recent transactions
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Latest activity this month</p>
                </div>
                <Link
                  to="/transactions"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  All <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </div>

              <div className="divide-warm -mx-2">
                {recent.map((t) => {
                  const cat = getCategoryByValue(t.category);
                  const income = t.type === "income";
                  return (
                    <div
                      key={t.id}
                      className="tx-row -mx-0 flex items-center justify-between gap-3 rounded-lg px-2 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/70 text-base"
                          aria-hidden="true"
                        >
                          {cat?.emoji || "📝"}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {t.custom_category || cat?.label || t.category}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.description || format(parseISO(t.date), "d MMM")}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "stat-amount shrink-0 text-sm",
                          income ? "text-success" : "text-foreground",
                        )}
                      >
                        {income ? "+" : "−"}
                        {formatCurr(Number(t.amount))}
                      </span>
                    </div>
                  );
                })}
                {recent.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No transactions this month
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <TransactionModal
        open={showAdd}
        onOpenChange={setShowAdd}
        onSubmit={(data) => addTransaction.mutate(data)}
        loading={addTransaction.isPending}
      />

      <BuyChaiModal
        open={showBuyChai}
        onOpenChange={setShowBuyChai}
      />
    </div>
  );
}
