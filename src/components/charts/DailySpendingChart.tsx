import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrency } from "@/contexts/CurrencyContext";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

/**
 * Daily spending for the current month. One series, one accent, compact axis
 * labels so the shape of the month reads at a glance.
 */
export function DailySpendingChart({ data }: { data: { day: string; amount: number }[] }) {
  const { format, formatCompact } = useCurrency();
  const reduced = usePrefersReducedMotion();

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="daily-spend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.22} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 6"
            stroke="hsl(var(--chart-grid))"
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tick={{ fill: "hsl(var(--chart-tick))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
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
              const amount = payload[0].value as number;
              return (
                <div className="chart-tooltip px-3 py-2 text-xs">
                  <p className="text-muted-foreground">Day {label}</p>
                  <p className="mt-1 stat-amount text-sm text-foreground">{format(amount)}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            name="Daily spending"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#daily-spend-fill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
            isAnimationActive={!reduced}
            animationDuration={750}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
