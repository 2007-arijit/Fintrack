import { useEffect, useState } from "react";

type Risk = "high" | "medium" | "low";

const tone: Record<Risk, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-success",
};

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(reducedMotion() ? target : 0);
  useEffect(() => {
    if (reducedMotion()) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

// Half-dial for the 0-10 indicator score. Ticks at 2 and 5 mark where the
// rule engine moves from "low" to "caution" and from "caution" to "high".
export default function RiskGauge({ score, risk }: { score: number; risk: Risk }) {
  const clamped = Math.max(0, Math.min(10, score));
  const [armed, setArmed] = useState(false);
  const shown = useCountUp(clamped);

  useEffect(() => {
    setArmed(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
    return () => cancelAnimationFrame(id);
  }, [clamped, risk]);

  const cx = 120, cy = 118, r = 92;
  const point = (value: number, radius: number) => {
    const angle = Math.PI * (1 - value / 10);
    return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)] as const;
  };
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div className={`relative mx-auto w-full max-w-[260px] ${tone[risk]}`} role="img"
      aria-label={`Indicator score ${clamped} out of 10`}>
      <svg viewBox="0 0 240 136" className="w-full overflow-visible">
        <path d={arc} pathLength={100} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
        <path d={arc} pathLength={100} fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={100} strokeDashoffset={armed ? 100 - clamped * 10 : 100}
          className="transition-[stroke-dashoffset] duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none" />
        {Array.from({ length: 11 }, (_, i) => {
          const major = i === 2 || i === 5;
          const [x1, y1] = point(i, r - 12);
          const [x2, y2] = point(i, r - (major ? 24 : 18));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--muted-foreground))"
            strokeOpacity={major ? 0.9 : 0.35} strokeWidth={major ? 1.5 : 1} />;
        })}
        {[2, 5].map((v) => {
          const [x, y] = point(v, r - 34);
          return <text key={v} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={9}
            fill="hsl(var(--muted-foreground))">{v}</text>;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <span className="font-heading text-5xl font-bold tabular-nums text-foreground">{shown}</span>
        <span className="ml-1 text-sm text-muted-foreground">of 10</span>
      </div>
    </div>
  );
}
