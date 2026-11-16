import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

interface FinancialRainTimelineProps {
  title?: string;
  subtitle?: string;
  onSkipToNext?: () => void;
  className?: string;
}

const FINTRACK_GLYPHS = "₹$€£¥0123456789+%−•₹$€0123456789";
const GLYPHS_PER_STREAM = 20;

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GlyphData {
  char: string;
  sizePx: number;
  lineHeight: number;
  scale: number;
  flip: number;
  glowPx: number;
  opacity: number;
  light: number;
  hue: number;
  sat: string;
}

interface StreamData {
  id: number;
  delay: number;
  opacity: number;
  driftDuration: number;
  driftDelay: number;
  driftOffset: number;
  pulse: boolean;
  glyphs: GlyphData[];
}

interface TitleChar {
  char: string;
  delay: number;
  glowPx: number;
}

/**
 * Self-running version of the financial-rain intro.
 *
 * The previous build scrubbed every glyph from scroll position, which meant a
 * `calc()` recalculation for ~600 spans on each scroll tick. Here the whole
 * sequence is CSS-driven (delays + keyframes on opacity/transform only), so the
 * intro starts on its own, loops as ambient motion, and stays on the compositor.
 */
export function FinancialRainTimeline({
  title = "CLARITY IN EVERY NUMBER",
  subtitle = "Income, spending and plans in one place",
  onSkipToNext,
  className,
}: FinancialRainTimelineProps) {
  const stageRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [columnCount, setColumnCount] = useState(24);

  useEffect(() => {
    const updateCols = () => {
      const w = window.innerWidth;
      if (w < 640) setColumnCount(12);
      else if (w < 1024) setColumnCount(18);
      else setColumnCount(24);
    };
    updateCols();
    window.addEventListener("resize", updateCols, { passive: true });
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  // Hold the timeline for one painted frame so the entrance never competes
  // with the route's first layout and paint.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || reducedMotion) return;

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        el.dataset.started = "true";
      });
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [reducedMotion]);

  // Pause the ambient loop when the hero leaves the viewport or the tab hides,
  // so it never competes with the gallery for frames.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || reducedMotion) return;

    const setPaused = (paused: boolean) => {
      el.dataset.paused = paused ? "true" : "false";
    };

    const observer = new IntersectionObserver(
      ([entry]) => setPaused(!entry?.isIntersecting),
      { threshold: 0.01 },
    );
    observer.observe(el);

    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion]);

  const streams = useMemo<StreamData[]>(() => {
    const rand = mulberry32(20261115);
    return Array.from({ length: columnCount }, (_, colIdx) => {
      const isTealStream = colIdx % 5 === 3;

      const glyphs: GlyphData[] = Array.from({ length: GLYPHS_PER_STREAM }, () => {
        const isTeal = isTealStream && rand() > 0.4;
        const opacity = Number((0.14 + rand() * 0.72).toFixed(2));
        return {
          char: FINTRACK_GLYPHS[Math.floor(rand() * FINTRACK_GLYPHS.length)],
          sizePx: Number((10 + rand() * 15).toFixed(1)),
          lineHeight: Number((0.7 + rand() * 1.2).toFixed(2)),
          scale: Number((0.95 + rand() * 0.45).toFixed(2)),
          flip: Number(((rand() > 0.5 ? 1 : -1) * (0.66 + rand() * 0.34)).toFixed(2)),
          glowPx: Number((opacity > 0.55 ? 4 + rand() * 8 : 0).toFixed(1)),
          opacity,
          light: Number((32 + rand() * 26).toFixed(1)),
          hue: isTeal ? 156 : 33 + Math.floor(rand() * 5),
          sat: isTeal ? "46%" : "90%",
        };
      });

      const driftDuration = Number((15 + rand() * 12).toFixed(1));

      return {
        id: colIdx,
        delay: Number((rand() * 0.45).toFixed(2)),
        opacity: Number((0.5 + rand() * 0.45).toFixed(2)),
        driftDuration,
        // Start each column mid-cycle so the field never moves in lockstep.
        driftDelay: Number((-rand() * driftDuration).toFixed(1)),
        driftOffset: Number((-11 + rand() * 7).toFixed(1)),
        pulse: rand() > 0.78,
        glyphs,
      };
    });
  }, [columnCount]);

  const titleWords = useMemo(() => {
    const all = title.split(" ");
    const total = all.reduce((sum, word) => sum + word.length, 0);
    let cursor = 0;
    return all.map((word) =>
      Array.from(word).map((char) => {
        const index = cursor++;
        const stagger = (index / Math.max(1, total - 1)) * 0.85;
        return {
          char,
          delay: Number((0.35 + stagger).toFixed(3)),
          glowPx: 10,
        } as TitleChar;
      }),
    );
  }, [title]);

  if (reducedMotion) {
    return (
      <section
        ref={stageRef}
        className={cn(
          "relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#090807] px-6 py-24 text-center",
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 45%, hsl(33 90% 56% / 0.2), transparent 70%)",
          }}
        />
        <p className="eyebrow relative text-primary">FinTrack Pulse</p>
        <h1 className="relative mt-4 font-display text-3xl font-medium tracking-[0.14em] text-primary sm:text-5xl">
          {title}
        </h1>
        <p className="relative mt-4 max-w-md text-sm text-muted-foreground">{subtitle}</p>
        {onSkipToNext && (
          <button
            type="button"
            onClick={onSkipToNext}
            className="relative mt-8 rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-xs font-medium tracking-wide text-primary transition-colors hover:bg-primary/20"
          >
            Explore environments ↓
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      ref={stageRef}
      aria-label="FinTrack generative data stream and title sequence"
      className={cn(
        "ft-rain-stage relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#090807]",
        className,
      )}
    >
      {/* Ambient private-banking glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(64% 58% at 50% 48%, hsl(33 90% 56% / 0.1), transparent 72%), radial-gradient(45% 40% at 22% 82%, hsl(156 46% 45% / 0.06), transparent 70%)",
        }}
      />

      {/* Rain layer — CSS-only, loops as ambience */}
      <div className="ft-rain-layer pointer-events-none absolute inset-0" aria-hidden="true">
        {streams.map((stream) => (
          <div
            key={stream.id}
            className="ft-rain-stream"
            style={
              {
                left: `${(stream.id / columnCount) * 100}%`,
                width: `${100 / columnCount}%`,
                "--col-delay": `${stream.delay}s`,
                "--col-op": stream.opacity,
              } as React.CSSProperties
            }
          >
            <div
              className="ft-rain-stream-inner"
              data-pulse={stream.pulse ? "true" : "false"}
              style={
                {
                  "--drift-dur": `${stream.driftDuration}s`,
                  "--drift-delay": `${stream.driftDelay}s`,
                  "--drift-offset": `${stream.driftOffset}%`,
                } as React.CSSProperties
              }
            >
              {stream.glyphs.map((g, gIdx) => (
                <span
                  key={gIdx}
                  className="ft-rain-glyph"
                  style={
                    {
                      "--g-size": `${g.sizePx}px`,
                      "--g-lh": g.lineHeight,
                      "--g-scale": g.scale,
                      "--g-flip": g.flip,
                      "--g-glow": `${g.glowPx}px`,
                      "--g-op": g.opacity,
                      "--g-light": `${g.light}%`,
                      "--g-hue": g.hue,
                      "--g-sat": g.sat,
                    } as React.CSSProperties
                  }
                >
                  {g.char}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Character-by-character reveal, then a gentle zoom-out */}
      <div className="ft-rain-title-wrap pointer-events-none absolute inset-0 grid place-items-center px-6">
        <h1 className="ft-rain-title font-display" aria-label={title}>
          {titleWords.map((chars, wIdx) => (
            <span key={wIdx} className="ft-rain-word" aria-hidden="true">
              {chars.map((c, cIdx) => (
                <span
                  key={`${wIdx}-${cIdx}`}
                  className="ft-rain-char"
                  style={
                    {
                      "--c-delay": `${c.delay}s`,
                      "--c-glow": `${c.glowPx}px`,
                    } as React.CSSProperties
                  }
                >
                  {c.char}
                </span>
              ))}
              {wIdx < titleWords.length - 1 && (
                <span className="ft-rain-space" aria-hidden="true" />
              )}
            </span>
          ))}
        </h1>
      </div>

      {/* Hand-off: appears where the title was */}
      <div className="ft-rain-cta pointer-events-none absolute inset-0 grid place-items-center px-6">
        <div className="flex max-w-md flex-col items-center text-center">
          <p className="eyebrow text-primary/90">FinTrack Pulse</p>
          <p className="mt-4 text-sm leading-relaxed text-white/60">{subtitle}</p>
          {onSkipToNext && (
            <button
              type="button"
              onClick={onSkipToNext}
              className="pointer-events-auto mt-7 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/12 px-5 py-2.5 text-xs font-semibold text-primary backdrop-blur-sm transition-colors hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Enter the ledger
              <span aria-hidden="true" className="ft-scroll-arrow">
                ↓
              </span>
            </button>
          )}
        </div>
      </div>

      {onSkipToNext && (
        <button
          type="button"
          onClick={onSkipToNext}
          className="ft-rain-skip absolute bottom-5 right-5 z-20 rounded-full border border-border/70 bg-background/70 px-3.5 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur-md transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Skip to gallery ↓
        </button>
      )}
    </section>
  );
}
