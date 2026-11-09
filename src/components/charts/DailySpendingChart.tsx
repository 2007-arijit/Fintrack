import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { useCurrency } from "@/contexts/CurrencyContext";

interface DailySpendingChartProps {
  data: { day: string; amount: number }[];
}

export function DailySpendingChart({ data }: DailySpendingChartProps) {
  const { format } = useCurrency();

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={false}
          content={({ active, payload, label }) => {
            if (!active || !payload?.[0]) return null;
            return (
              <div className="chart-tooltip px-3 py-2 text-xs">
                <p className="font-medium text-foreground">{label}</p>
                <p className="text-muted-foreground">{format(payload[0].value as number)}</p>
              </div>
            );
          }}
        />
        <Bar
          dataKey="amount"
          fill="hsl(var(--chart-1))"
          radius={[3, 3, 0, 0]}
          activeBar={{ fill: "hsl(var(--chart-1))", opacity: 1, radius: 3 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
