import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";

// Decorative network illustration. It does NOT represent real banks, payments or live data.
// Cost: ~20 SVG nodes, 3 SMIL packets, 3 CSS-animated elements (transform/opacity only).
// Animations pause when the SVG is off-screen or the tab is hidden, and are removed entirely under reduced motion.

const C = { x: 180, y: 110 };
const N = {
  A: [34, 60], B: [88, 128], C: [60, 186], D: [130, 36], E: [236, 30],
  F: [300, 80], G: [322, 150], H: [262, 190], I: [140, 192],
} as const;
const EDGES: Array<[keyof typeof N | "S", keyof typeof N | "S"]> = [
  ["A", "B"], ["B", "C"], ["A", "D"], ["D", "E"], ["E", "F"], ["F", "G"], ["G", "H"], ["H", "I"], ["I", "C"], ["I", "B"],
  ["B", "S"], ["D", "S"], ["E", "S"], ["F", "S"], ["H", "S"], ["I", "S"],
];
const at = (k: keyof typeof N | "S") => (k === "S" ? [C.x, C.y] : N[k]);
const PACKETS = [
  { d: "M34 60 L88 128 L180 110", dur: "7s", begin: "0s" },
  { d: "M322 150 L300 80 L180 110", dur: "8s", begin: "2.5s" },
  { d: "M60 186 L140 192 L180 110", dur: "9s", begin: "4.5s" },
];

function useAnimationGate(ref: React.RefObject<SVGSVGElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const apply = () => {
      const paused = !visible || document.hidden;
      el.dataset.paused = String(paused);
      if (paused) el.pauseAnimations?.();
      else el.unpauseAnimations?.();
    };
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; apply(); })
      : null;
    io?.observe(el);
    document.addEventListener("visibilitychange", apply);
    apply();
    return () => { io?.disconnect(); document.removeEventListener("visibilitychange", apply); };
  }, [ref]);
}

export default function NetworkMap({ tone = "auto", className = "" }: { tone?: "auto" | "dark"; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const still = prefersReducedMotion();
  useAnimationGate(ref);

  return (
    <svg
      ref={ref}
      viewBox="0 0 360 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={`nm ${tone === "dark" ? "nm-dark" : ""} ${className}`}
    >
      {EDGES.map(([a, b], i) => {
        const [x1, y1] = at(a), [x2, y2] = at(b);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--nm-line)" strokeWidth={1} />;
      })}

      {Object.entries(N).map(([k, [x, y]]) => {
        const lit = k === "F" || k === "I";
        return (
          <circle key={k} cx={x} cy={y} r={lit ? 5 : 3.5} fill={lit ? "var(--nm-teal)" : "var(--nm-node)"}
            stroke={lit ? "none" : "var(--nm-node-stroke)"} strokeWidth={1} className={lit ? "nm-pulse" : undefined} />
        );
      })}

      {!still && (
        <>
          <circle cx={C.x} cy={C.y} r={22} fill="none" stroke="var(--nm-accent)" strokeWidth={1.2} className="nm-ring" />
          <circle cx={C.x} cy={C.y} r={22} fill="none" stroke="var(--nm-accent)" strokeWidth={1.2} className="nm-ring" style={{ animationDelay: "2.25s" }} />
          {PACKETS.map((p, i) => (
            <circle key={i} r={2.6} fill="var(--nm-teal)">
              <animateMotion path={p.d} dur={p.dur} begin={p.begin} repeatCount="indefinite" />
            </circle>
          ))}
        </>
      )}

      <g transform={`translate(${C.x} ${C.y})`}>
        <circle r={24} fill="var(--nm-node)" stroke="var(--nm-accent)" strokeWidth={1.5} />
        <path d="M0 -14 L11 -10 V2 C11 9 6 13 0 16 C-6 13 -11 9 -11 2 V-10 Z" fill="var(--nm-accent)" />
        <path d="M-4.5 1 L-1 4.5 L5.5 -3.5" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
