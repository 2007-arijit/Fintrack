import { CategoryIcon } from "@/components/CategoryIcon";
import { useState, useMemo } from "react";
import { useTransactions } from "@/hooks/useTransactions";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCategoryByValue, CHART_COLORS, DEBT_AUTO_CATEGORIES } from "@/lib/categoryConfig";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

export default function Reports() {
  const { transactions } = useTransactions();
  const { format: formatCurr } = useCurrency();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState((now.getMonth() + 1).toString());

  const year = parseInt(selectedYear);
  const month = parseInt(selectedMonth);
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(new Date(year, month - 1));

  const monthTxns = useMemo(
    () => transactions.filter((t) => isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd })),
    [transactions, monthStart, monthEnd]
  );

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxns
      .filter((t) => t.type === "expense" && !DEBT_AUTO_CATEGORIES.includes(t.category))
      .forEach((t) => { map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return Object.entries(map)
      .map(([cat, total]) => ({
        category: cat,
        total,
        label: getCategoryByValue(cat)?.label || cat,
      }))
      .sort((a, b) => b.total - a.total);
  }, [monthTxns]);

  const yearlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const start = startOfMonth(new Date(year, i));
      const end = endOfMonth(new Date(year, i));
      const txns = transactions.filter((t) => isWithinInterval(parseISO(t.date), { start, end }));
      return {
        month: format(start, "MMM"),
        income: txns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0),
        expense: txns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      };
    });
  }, [transactions, year]);

  const totalIncome = monthTxns.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = monthTxns.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const netSavings = totalIncome - totalExpense;

  const years = Array.from({ length: 5 }, (_, i) => (now.getFullYear() - i).toString());
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading font-bold text-2xl">Reports</h1>
        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[130px] bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px] bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-card border-border">
              {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Income</p>
          <p className="text-xl font-bold stat-amount text-success">{formatCurr(totalIncome)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Expenses</p>
          <p className="text-xl font-bold stat-amount text-destructive">{formatCurr(totalExpense)}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Net Savings</p>
          <p className={`text-xl font-bold stat-amount ${netSavings >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurr(netSavings)}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="glass-card p-5">
        <h3 className="font-heading font-semibold mb-4">Top Spending Categories</h3>
        {categoryBreakdown.length > 0 ? (
          <div className="space-y-3">
            {categoryBreakdown.slice(0, 8).map((c, i) => (
              <div key={c.category} className="flex items-center gap-3">
                <CategoryIcon category={c.category} className="h-8 w-8" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{c.label}</span>
                    <span className="font-medium">{formatCurr(c.total)}</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(c.total / categoryBreakdown[0].total) * 100}%`,
                        background: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No expense data for this period</p>
        )}
      </div>

      {/* Yearly chart */}
      <div className="glass-card p-5">
        <h3 className="font-heading font-semibold mb-4">{year} Annual Overview</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={yearlyData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={false}
              content={({ active, payload, label }) => {
                if (!active || !payload) return null;
                return (
                  <div className="chart-tooltip px-3 py-2 text-xs">
                    <p className="font-medium text-foreground mb-1">{label}</p>
                    {payload.map((p, i) => (
                      <p key={i} style={{ color: p.color }}>{p.name}: {formatCurr(p.value as number)}</p>
                    ))}
                  </div>
                );
              }}
            />
            <Bar dataKey="income" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} name="Income" activeBar={{ fill: "hsl(var(--success))", opacity: 1, radius: 4 }} />
            <Bar dataKey="expense" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Expense" activeBar={{ fill: "hsl(var(--destructive))", opacity: 1, radius: 4 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
