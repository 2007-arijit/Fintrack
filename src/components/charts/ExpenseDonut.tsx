import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getCategoryByValue, CHART_COLORS } from "@/lib/categoryConfig";
import { useCurrency } from "@/contexts/CurrencyContext";
import { categoryIcon } from "@/components/CategoryIcon";
import { prefersReducedMotion } from "@/lib/motion";

function CategoryLabel({ category, name }: { category: string; name: string }) {
  const Icon = categoryIcon(category);
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

interface ExpenseDonutProps {
  data: { category: string; total: number }[];
}

export function ExpenseDonut({ data }: ExpenseDonutProps) {
  const { format } = useCurrency();
  if (data.length === 0) return null;

  const chartData = data.map((d) => ({
    name: getCategoryByValue(d.category)?.label || d.category,
    value: d.total,
    category: d.category,
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="w-40 h-40 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
              paddingAngle={2}
              dataKey="value"
              isAnimationActive={!prefersReducedMotion()}
              stroke="none"
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="chart-tooltip px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">
                      <CategoryLabel category={d.category} name={d.name} />
                    </p>
                    <p className="text-muted-foreground">{format(d.value)}</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 max-h-40 overflow-auto">
        {chartData.slice(0, 6).map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-muted-foreground truncate flex-1">
              <CategoryLabel category={d.category} name={d.name} />
            </span>
            <span className="font-medium">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
