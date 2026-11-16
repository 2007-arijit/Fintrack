import { useEffect, useRef, useState } from "react";

// Decorative network illustration. It does not represent real payment traffic.
// Pure SVG + CSS transforms; animation pauses when scrolled out of view and is
// removed for reduced-motion users (see .nm-* rules in index.css).
const nodes: Array<[number, number]> = [
  [30, 70], [95, 150], [150, 55], [170, 190], [320, 45], [360, 175],
  [425, 95], [450, 185], [235, 22], [60, 205], [400, 30],
];
const edges: Array<[number, number]> = [
  [0, 2], [0, 1], [1, 3], [4, 6], [6, 5], [5, 7], [8, 2], [8, 4], [9, 1], [10, 4], [10, 6], [9, 3],
];
const hub: [number, number] = [240, 120];
const spokes = [2, 3, 4, 5];
const routes = [
  "M30 70 L150 55 L240 120",
  "M450 185 L360 175 L240 120",
];

export default function NetworkMap({ animated = true, className = "" }: { animated?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !animated || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [animated]);

  return (
    <div ref={ref} className={`nm text-primary ${className}`} data-active={animated && visible} aria-hidden="true">
      <svg viewBox="0 0 480 240" className="h-full w-full" fill="none">
        <g stroke="currentColor" strokeOpacity={0.38} strokeWidth={1}>
          {edges.map(([a, b]) => <line key={`${a}-${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />)}
          {spokes.map((i) => <line key={`s${i}`} x1={nodes[i][0]} y1={nodes[i][1]} x2={hub[0]} y2={hub[1]} strokeOpacity={0.6} />)}
        </g>
        {nodes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3.5} fill="hsl(var(--card))" stroke="currentColor" strokeWidth={1.4} />
        ))}
        {animated && [2, 5].map((i, k) => (
          <circle key={`p${i}`} cx={nodes[i][0]} cy={nodes[i][1]} r={4} stroke="currentColor" strokeWidth={1}
            className="nm-ring" style={{ animationDelay: `${k * 1.6}s` }} />
        ))}
        <circle cx={hub[0]} cy={hub[1]} r={26} stroke="currentColor" strokeWidth={1} className={animated ? "nm-ring" : ""} strokeOpacity={animated ? undefined : 0.25} />
        {animated && routes.map((d, k) => (
          <circle key={k} r={3} fill="currentColor" className="nm-dot"
            style={{ offsetPath: `path('${d}')`, animationDelay: `${k * 3}s` } as React.CSSProperties} />
        ))}
        <path d="M240 96 l23 8 v17 c0 15 -10 25 -23 31 c-13 -6 -23 -16 -23 -31 v-17 z" fill="hsl(var(--card))" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M231 123 l7 7 l12 -14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
