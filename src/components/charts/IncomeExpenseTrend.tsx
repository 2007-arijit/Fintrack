import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrency } from "@/contexts/CurrencyContext";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface TrendDataItem {
  month: string;
  income: number;
  expense: number;
}

/**
 * Six-month income vs expense. Two lines, two semantic colours, no chart junk.
 * The legend is rendered as HTML so it can carry the actual values.
 */
export function IncomeExpenseTrend({ data }: { data: TrendDataItem[] }) {
  const { format, formatCompact } = useCurrency();
  const reduced = usePrefersReducedMotion();

  const last = data[data.length - 1];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-success" aria-hidden="true" />
          <span className="text-muted-foreground">Income</span>
          {last && <span className="tabular font-medium text-foreground">{format(last.income)}</span>}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-destructive" aria-hidden="true" />
          <span className="text-muted-foreground">Expense</span>
          {last && <span className="tabular font-medium text-foreground">{format(last.expense)}</span>}
        </span>
      </div>

      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
              width={56}
              tickFormatter={(value: number) => formatCompact(value)}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
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
                          {format(item.value as number)}
                        </span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="income"
              name="Income"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
              isAnimationActive={!reduced}
              animationDuration={750}
            />
            <Line
              type="monotone"
              dataKey="expense"
              name="Expense"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
              isAnimationActive={!reduced}
              animationDuration={750}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
