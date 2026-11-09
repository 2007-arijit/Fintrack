import { useState, useMemo, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTransactions } from "@/hooks/useTransactions";
import { useDebts } from "@/hooks/useDebts";
import { useMonthlyBalance } from "@/hooks/useMonthlyBalance";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useCurrency } from "@/contexts/CurrencyContext";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { TransactionModal } from "@/components/TransactionModal";
import { ExpenseDonut } from "@/components/charts/ExpenseDonut";
import { IncomeExpenseTrend } from "@/components/charts/IncomeExpenseTrend";
import { DailySpendingChart } from "@/components/charts/DailySpendingChart";
import { BalanceHero } from "@/components/dashboard/BalanceHero";
import { PayShieldCard } from "@/components/dashboard/PayShieldCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { getCategoryByValue } from "@/lib/categoryConfig";
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { Wallet, TrendingUp, TrendingDown, HandCoins, Landmark, Settings, Coffee, Sun, Moon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { InstallAppBanner } from "@/components/layout/InstallAppBanner";
import { useTheme } from "next-themes";

function greetingFor(date: Date) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { transactions, isLoading, isError, refetch, addTransaction } = useTransactions();
  const { preferences } = useUserPreferences();
  const { totalReceivable, totalPayable } = useDebts();
  const { format: formatCurr } = useCurrency();
  const { carryForward } = useMonthlyBalance(transactions);
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
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
        isWithinInterval(parseISO(t.date), { start: thisMonthStart, end: thisMonthEnd })
      ),
    [transactions, thisMonthStart, thisMonthEnd]
  );

  const totalIncome = useMemo(
    () => thisMonth.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
    [thisMonth]
  );
  const totalExpense = useMemo(
    () => thisMonth.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
    [thisMonth]
  );
  const balance = carryForward + totalIncome - totalExpense;

  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    thisMonth
      .filter((t) => t.type === "expense")
      .forEach((t) => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
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
        isWithinInterval(parseISO(t.date), { start, end })
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

  const firstName = (preferences?.display_name || preferences?.username || "").trim().split(/\s+/)[0];
  const net = totalIncome - totalExpense;
  const monthLabel = format(now, "MMMM yyyy");

  // Plain-language summaries so the charts are not the only way to get this information.
  const topCategory = expenseByCategory[0];
  const topCategoryLabel = topCategory ? getCategoryByValue(topCategory.category)?.label ?? topCategory.category : "";
  const latestTrend = trendData[trendData.length - 1];

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
            {greetingFor(now)}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{format(now, "EEEE, d MMMM yyyy")}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-muted-foreground"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
            <a href="https://buymeachai.in/arghya" target="_blank" rel="noopener noreferrer" aria-label="Buy me a chai (opens in a new tab)"><Coffee /></a>
          </Button>
          <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
            <Link to="/settings" aria-label="Settings"><Settings /></Link>
          </Button>
          {/* On phones the floating add button covers this. */}
          <Button className="ml-2 hidden sm:inline-flex" onClick={() => setShowAdd(true)}><Plus /> Add transaction</Button>
        </div>
      </header>

      <InstallAppBanner />

      {isError ? (
        <div className="surface">
          <ErrorState
            title="Couldn't load your transactions"
            description="Your balance and charts need this data, so they are hidden rather than shown as zero. Check your connection and try again."
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <BalanceHero
                loading={isLoading}
                monthLabel={monthLabel}
                balanceText={formatCurr(balance)}
                carriedText={carryForward !== 0 ? formatCurr(carryForward) : undefined}
                netText={formatCurr(Math.abs(net))}
                netPositive={net >= 0}
              />
            </div>
            <PayShieldCard />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard title="Income" value={formatCurr(totalIncome)} icon={TrendingUp} variant="income" loading={isLoading} subtitle="This month" />
            <StatCard title="Expenses" value={formatCurr(totalExpense)} icon={TrendingDown} variant="expense" loading={isLoading} subtitle="This month" />
            <StatCard title="Receivable" value={formatCurr(totalReceivable)} icon={HandCoins} variant="receivable" loading={isLoading}
              subtitle="Owed to you" onClick={() => navigate("/debt?type=receivable")} />
            <StatCard title="Payable" value={formatCurr(totalPayable)} icon={Landmark} variant="payable" loading={isLoading}
              subtitle="You owe" onClick={() => navigate("/debt?type=payable")} />
          </div>

          <QuickActions onAddTransaction={() => setShowAdd(true)} />

          {transactions.length === 0 && !isLoading ? (
            <div className="surface">
              <EmptyState
                icon={Wallet}
                title="No transactions yet"
                description="Add your first transaction and your balance, charts and recent activity will fill in here."
                actionLabel="Add transaction"
                onAction={() => setShowAdd(true)}
              />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <figure className="surface p-5 lg:col-span-2">
                <h2 className="mb-4 font-heading text-base font-semibold">Income and expenses, last 6 months</h2>
                <IncomeExpenseTrend data={trendData} />
                <figcaption className="sr-only">
                  {latestTrend ? `In ${latestTrend.month}, income was ${formatCurr(latestTrend.income)} and expenses were ${formatCurr(latestTrend.expense)}.` : ""}
                </figcaption>
              </figure>

              <figure className="surface p-5">
                <h2 className="mb-4 font-heading text-base font-semibold">Where it went</h2>
                {expenseByCategory.length > 0 ? (
                  <ExpenseDonut data={expenseByCategory} />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No expenses recorded in {format(now, "MMMM")} yet.</p>
                )}
                <figcaption className="sr-only">
                  {topCategory ? `Largest expense category this month: ${topCategoryLabel}, ${formatCurr(topCategory.total)}.` : ""}
                </figcaption>
              </figure>

              <figure className="surface p-5 lg:col-span-2">
                <h2 className="mb-4 font-heading text-base font-semibold">Daily spending</h2>
                {dailySpending.length > 0 ? (
                  <DailySpendingChart data={dailySpending} />
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">Daily spending appears once you record an expense this month.</p>
                )}
                <figcaption className="sr-only">
                  {dailySpending.length > 0 ? `Spending was recorded on ${dailySpending.length} days this month.` : ""}
                </figcaption>
              </figure>

              <RecentActivity transactions={transactions} />
            </div>
          )}
        </>
      )}

      <TransactionModal
        open={showAdd}
        onOpenChange={setShowAdd}
        onSubmit={(data) => addTransaction.mutate(data)}
        loading={addTransaction.isPending}
      />
    </div>
  );
}
