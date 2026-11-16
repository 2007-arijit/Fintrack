import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getCategoryByValue, CHART_COLORS } from "@/lib/categoryConfig";
import { useCurrency } from "@/contexts/CurrencyContext";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface ExpenseDonutProps {
  data: { category: string; total: number }[];
}

/**
 * Expense composition. The percentage is the readable signal; the ring is
 * orientation, not decoration. Amounts live in the legend where they can be
 * scanned, rather than hidden behind hover.
 */
export function ExpenseDonut({ data }: ExpenseDonutProps) {
  const { format } = useCurrency();
  const reduced = usePrefersReducedMotion();

  if (data.length === 0) return null;

  const chartData = data.map((d) => {
    const category = getCategoryByValue(d.category);
    return {
      name: category?.label || d.category,
      value: d.total,
      emoji: category?.emoji || "📝",
    };
  });

  const total = chartData.reduce((sum, d) => sum + d.value, 0);
  const visible = chartData.slice(0, 6);
  const remainder = chartData.length - visible.length;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={78}
              paddingAngle={2}
              dataKey="value"
              stroke="hsl(var(--card))"
              strokeWidth={2}
              isAnimationActive={!reduced}
              animationDuration={700}
              animationBegin={80}
            >
              {chartData.map((entry, i) => (
                <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload as { name: string; value: number; emoji: string };
                return (
                  <div className="chart-tooltip px-3 py-2.5 text-xs">
                    <p className="font-semibold text-foreground">
                      {d.emoji} {d.name}
                    </p>
                    <p className="mt-1 tabular text-muted-foreground">{format(d.value)}</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="eyebrow text-[9px]">Total</span>
          <span className="mt-1 stat-amount text-base text-foreground">{format(total)}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 self-stretch">
        <ul className="flex h-full flex-col justify-center gap-2.5">
          {visible.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2.5 text-sm">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.name}</span>
              <span className="tabular text-xs text-muted-foreground">
                {((d.value / total) * 100).toFixed(0)}%
              </span>
              <span className="tabular w-20 text-right text-xs font-medium text-foreground">
                {format(d.value)}
              </span>
            </li>
          ))}
          {remainder > 0 && (
            <li className="pt-1 text-xs text-muted-foreground">+{remainder} more categories</li>
          )}
        </ul>
      </div>
    </div>
  );
}
