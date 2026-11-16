import { useState, useMemo } from "react";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCategoryByValue, DEBT_AUTO_CATEGORIES } from "@/lib/categoryConfig";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  isWithinInterval,
} from "date-fns";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pctChange(current: number, previous: number) {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function Delta({ change, invert = false, comparison }: { change: number | null; invert?: boolean; comparison: string }) {
  if (change === null) {
    return <span className="text-xs text-muted-foreground">No prior month to compare</span>;
  }
  const up = change >= 0;
  const good = invert ? !up : up;
  const Icon = Math.abs(change) < 0.5 ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          Math.abs(change) < 0.5 ? "text-muted-foreground" : good ? "text-success" : "text-destructive",
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {Math.abs(change).toFixed(0)}%
      </span>
      <span className="text-muted-foreground">vs {comparison}</span>
    </span>
  );
}

export default function Reports() {
  const { transactions } = useTransactions();
  const { format: formatCurr, formatCompact } = useCurrency();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((now.getMonth() + 1).toString());

  const year = parseInt(selectedYear, 10);
  const month = parseInt(selectedMonth, 10);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));
  const previous = subMonths(monthStart, 1);

  const monthTxns = useMemo(
    () => transactions.filter((t) => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd })),
    [transactions, monthStart, monthEnd],
  );

  const previousTxns = useMemo(
    () =>
      transactions.filter((t) =>
        isWithinInterval(parseISO(t.date), {
          start: startOfMonth(previous),
          end: endOfMonth(previous),
        }),
      ),
    [transactions, previous],
  );

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxns
      .filter((t) => t.type === "expense" && !DEBT_AUTO_CATEGORIES.includes(t.category))
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return Object.entries(map)
      .map(([cat, total]) => ({
        category: cat,
        total,
        label: getCategoryByValue(cat)?.label || cat,
        emoji: getCategoryByValue(cat)?.emoji || "📝",
      }))
      .sort((a, b) => b.total - a.total);
  }, [monthTxns]);

  const yearlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const start = startOfMonth(new Date(year, i));
      const end = endOfMonth(new Date(year, i));
      const txns = transactions.filter((t) => isWithinInterval(parseISO(t.date), { start, end }));
      const income = txns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expense = txns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      return { month: format(start, "MMM"), income, expense, net: income - expense };
    });
  }, [transactions, year]);

  const totalIncome = monthTxns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = monthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const netSavings = totalIncome - totalExpense;

  const prevIncome = previousTxns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const prevExpense = previousTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const prevNet = prevIncome - prevExpense;

  const comparison = format(previous, "MMMM");
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : null;

  const topCategory = categoryBreakdown[0];
  const topShare = topCategory ? (topCategory.total / totalExpense) * 100 : 0;

  const years = Array.from({ length: 5 }, (_, i) => (now.getFullYear() - i).toString());

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="A monthly reading of where the money came from, where it went, and what changed."
        actions={
          <>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-9 w-[132px] border-border bg-card/40" aria-label="Select month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={(i + 1).toString()}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-9 w-[96px] border-border bg-card/40" aria-label="Select year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-card">
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {/* Three comparable metrics, each with an honest previous-month delta. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <p className="eyebrow">Income</p>
          <p className="stat-amount mt-3 text-2xl text-foreground">{formatCurr(totalIncome)}</p>
          <div className="mt-2">
            <Delta change={pctChange(totalIncome, prevIncome)} comparison={comparison} />
          </div>
        </div>

        <div className="glass-card p-5">
          <p className="eyebrow">Expenses</p>
          <p className="stat-amount mt-3 text-2xl text-foreground">{formatCurr(totalExpense)}</p>
          <div className="mt-2">
            <Delta change={pctChange(totalExpense, prevExpense)} comparison={comparison} invert />
          </div>
        </div>

        <div className="glass-card p-5">
          <p className="eyebrow">Net savings</p>
          <p
            className={cn(
              "stat-amount mt-3 text-2xl",
              netSavings >= 0 ? "text-foreground" : "text-destructive",
            )}
          >
            {netSavings >= 0 ? "+" : ""}
            {formatCurr(netSavings)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Delta change={pctChange(netSavings, prevNet)} comparison={comparison} />
            <span className="text-xs text-muted-foreground">
              {savingsRate === null ? "· no income recorded" : `· ${savingsRate.toFixed(0)}% of income kept`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Category ranking. One accent, ranked — no rainbow. */}
        <section className="glass-card p-5 lg:col-span-5" aria-labelledby="reports-categories">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 id="reports-categories" className="text-sm font-semibold text-foreground">
                Spending categories
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {MONTHS[month - 1]} {year}
              </p>
            </div>
            {topCategory && (
              <span className="rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                {topShare.toFixed(0)}% in {topCategory.label}
              </span>
            )}
          </div>

          {categoryBreakdown.length > 0 ? (
            <ol className="space-y-4">
              {categoryBreakdown.slice(0, 8).map((c, i) => {
                const share = totalExpense > 0 ? (c.total / totalExpense) * 100 : 0;
                return (
                  <li key={c.category}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="tabular w-4 shrink-0 text-[10px] text-muted-foreground/70">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span aria-hidden="true">{c.emoji}</span>
                        <span className="truncate text-foreground">{c.label}</span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2 text-xs">
                        <span className="tabular text-muted-foreground">{share.toFixed(0)}%</span>
                        <span className="stat-amount text-foreground">{formatCurr(c.total)}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary bar-grow"
                        style={{ width: `${Math.max(2, share)}%`, opacity: Math.max(0.4, 1 - i * 0.08) }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No expense data for this period
            </p>
          )}
        </section>

        {/* Annual overview with a net line — comparison, not decoration. */}
        <section className="glass-card p-5 lg:col-span-7" aria-labelledby="reports-annual">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="reports-annual" className="text-sm font-semibold text-foreground">
                Annual overview
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Income, expenses and net by month</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-success" aria-hidden="true" />
                <span className="text-muted-foreground">Income</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-destructive/70" aria-hidden="true" />
                <span className="text-muted-foreground">Expense</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-primary" aria-hidden="true" />
                <span className="text-muted-foreground">Net</span>
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yearlyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="2 6"
                  stroke="hsl(var(--chart-grid))"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "hsl(var(--chart-tick))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--chart-tick))", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={58}
                  tickFormatter={(value: number) => formatCompact(value)}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--secondary) / 0.45)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="chart-tooltip px-3 py-2 text-xs">
                        <p className="mb-1.5 font-medium text-foreground">{label}</p>
                        {payload.map((item) => (
                          <p key={item.dataKey as string} className="flex items-center gap-2 py-0.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: item.color }}
                              aria-hidden="true"
                            />
                            <span className="capitalize text-muted-foreground">{item.dataKey}</span>
                            <span className="tabular ml-auto font-medium text-foreground">
                              {formatCurr(item.value as number)}
                            </span>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="income"
                  name="Income"
                  fill="hsl(var(--success))"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive
                  animationDuration={650}
                />
                <Bar
                  dataKey="expense"
                  name="Expense"
                  fill="hsl(var(--destructive) / 0.7)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                  isAnimationActive
                  animationDuration={650}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                  isAnimationActive
                  animationDuration={750}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
