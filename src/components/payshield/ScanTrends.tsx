import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Risk = "high" | "medium" | "low";
export type TrendScan = { id: string; ts: number; score: number; risk: Risk; preview: string; kind: string };

const fill: Record<Risk, string> = {
  high: "hsl(var(--destructive))",
  medium: "hsl(var(--warning))",
  low: "hsl(var(--success))",
};
const label: Record<Risk, string> = { high: "High risk", medium: "Caution", low: "No warning signs" };

export default function ScanTrends({ scans, onSelect }: { scans: TrendScan[]; onSelect?: (id: string) => void }) {
  const ordered = [...scans].sort((a, b) => a.ts - b.ts).map((s, i) => ({
    ...s,
    name: new Date(s.ts).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    index: i,
  }));
  const count = (risk: Risk) => scans.filter((s) => s.risk === risk).length;
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div>
      <dl className="mb-4 grid grid-cols-3 gap-3 text-sm">
        {(["high", "medium", "low"] as Risk[]).map((risk) => (
          <div key={risk} className="border-l-2 pl-3" style={{ borderColor: fill[risk] }}>
            <dt className="text-xs text-muted-foreground">{label[risk]}</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{count(risk)}</dd>
          </div>
        ))}
      </dl>
      <div className="h-44 w-full" aria-label="Indicator score of recent scans">
        <ResponsiveContainer>
          <BarChart data={ordered} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
            <XAxis dataKey="index" tickFormatter={(i) => ordered[i]?.name ?? ""} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
            <YAxis domain={[0, 10]} ticks={[0, 2, 5, 10]} tickLine={false} axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <ReferenceLine y={5} stroke="hsl(var(--destructive))" strokeDasharray="3 4" strokeOpacity={0.5} />
            <ReferenceLine y={2} stroke="hsl(var(--warning))" strokeDasharray="3 4" strokeOpacity={0.5} />
            <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as TrendScan;
                return (
                  <div className="max-w-[220px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="font-medium">{label[s.risk]}, score {s.score}</p>
                    <p className="mt-0.5 truncate text-muted-foreground">{s.preview || "Empty scan"}</p>
                  </div>
                );
              }} />
            <Bar dataKey="score" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationDuration={700}
              onClick={(d: any) => onSelect?.(d.id)} cursor={onSelect ? "pointer" : undefined}>
              {ordered.map((s) => <Cell key={s.id} fill={fill[s.risk]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Dashed lines show where a scan becomes a caution (2) and high risk (5).</p>
    </div>
  );
}
