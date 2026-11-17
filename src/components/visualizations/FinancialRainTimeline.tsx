import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialRainTimelineProps {
  title?: string;
  subtitle?: string;
  onSkipToNext?: () => void;
  onComplete?: () => void;
  autoRedirectSeconds?: number;
  className?: string;
}

const FINTRACK_GLYPHS = "₹$€£¥₹$€0123456789%+-•*₹0123456789$9876543210";
const GLYPHS_PER_BLOCK_DESKTOP = 38;
const GLYPHS_PER_BLOCK_MOBILE = 28;

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
  isLead: boolean;
}

interface StreamData {
  id: number;
  delay: number;
  opacity: number;
  fallDuration: number;
  fallDelay: number;
  pulse: boolean;
  glyphs: GlyphData[];
}

interface TitleChar {
  char: string;
  delay: number;
  glowPx: number;
}

/**
 * High-performance, fast-paced financial rain intro.
 *
 * Renders cascading currency and numeric streams that fall smoothly and rapidly
 * using hardware-accelerated CSS compositor transforms. Safe for low-end mobile.
 */
export function FinancialRainTimeline({
  title = "CLARITY IN EVERY NUMBER",
  subtitle = "Income, spending and plans in one honest record",
  onSkipToNext,
  onComplete,
  autoRedirectSeconds = 5,
  className,
}: FinancialRainTimelineProps) {
  const stageRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [columnCount, setColumnCount] = useState(20);
  const [secondsRemaining, setSecondsRemaining] = useState(autoRedirectSeconds);

  // Responsive column count for low-end devices
  useEffect(() => {
    const updateCols = () => {
      const w = window.innerWidth;
      if (w < 640) setColumnCount(12);
      else if (w < 1024) setColumnCount(16);
      else setColumnCount(22);
    };
    updateCols();
    window.addEventListener("resize", updateCols, { passive: true });
    return () => window.removeEventListener("resize", updateCols);
  }, []);

  // Frame initialization
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

  // Pause when offscreen or tab hidden to preserve mobile battery
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

  // Auto-redirect countdown timer
  useEffect(() => {
    if (!onComplete || autoRedirectSeconds <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onComplete, autoRedirectSeconds]);

  // Keyboard shortcut to skip (Enter / Space / Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        if (onComplete) onComplete();
        else if (onSkipToNext) onSkipToNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onComplete, onSkipToNext]);

  // Fast-paced rain columns
  const streams = useMemo<StreamData[]>(() => {
    const rand = mulberry32(20261117);
    const glyphsCount = columnCount <= 12 ? GLYPHS_PER_BLOCK_MOBILE : GLYPHS_PER_BLOCK_DESKTOP;

    return Array.from({ length: columnCount }, (_, colIdx) => {
      const isTealStream = colIdx % 5 === 2;

      // Generate structured rain streaks (droplet head + tapering luminous tail)
      const glyphs: GlyphData[] = Array.from({ length: glyphsCount }, (_, gIdx) => {
        const isTeal = isTealStream && rand() > 0.35;
        // Periodic leading droplets every ~9-11 glyphs
        const streakPos = gIdx % 10;
        const isLead = streakPos === 0;
        let opacity = 0.25;
        let light = 38;
        let glowPx = 0;

        if (isLead) {
          opacity = 1.0;
          light = 95;
          glowPx = 14;
        } else if (streakPos <= 2) {
          opacity = 0.88;
          light = 75;
          glowPx = 8;
        } else if (streakPos <= 5) {
          opacity = 0.6;
          light = 55;
          glowPx = 4;
        } else {
          opacity = Number((0.18 + rand() * 0.2).toFixed(2));
          light = Number((34 + rand() * 18).toFixed(1));
          glowPx = 0;
        }

        return {
          char: FINTRACK_GLYPHS[Math.floor(rand() * FINTRACK_GLYPHS.length)],
          sizePx: Number((12 + rand() * 9).toFixed(1)),
          lineHeight: Number((0.95 + rand() * 0.2).toFixed(2)),
          scale: isLead ? 1.15 : Number((0.95 + rand() * 0.25).toFixed(2)),
          flip: Number(((rand() > 0.5 ? 1 : -1) * (0.85 + rand() * 0.15)).toFixed(2)),
          glowPx,
          opacity,
          light,
          hue: isTeal ? 156 : 38 + Math.floor(rand() * 8),
          sat: isTeal ? "55%" : "92%",
          isLead,
        };
      });

      // Fast rainfall: 0.9s to 1.6s per complete fall cycle across the viewport
      const fallDuration = Number((0.9 + rand() * 0.7).toFixed(2));
      // Pre-seed negative delay so rain is actively falling across the whole screen on mount
      const fallDelay = Number((-rand() * fallDuration).toFixed(2));

      return {
        id: colIdx,
        delay: Number((rand() * 0.18).toFixed(2)),
        opacity: Number((0.7 + rand() * 0.3).toFixed(2)),
        fallDuration,
        fallDelay,
        pulse: rand() > 0.75,
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
        const stagger = (index / Math.max(1, total - 1)) * 0.75;
        return {
          char,
          delay: Number((0.25 + stagger).toFixed(3)),
          glowPx: 12,
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
        {(onComplete || onSkipToNext) && (
          <button
            type="button"
            onClick={onComplete || onSkipToNext}
            className="relative mt-8 rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-xs font-medium tracking-wide text-primary transition-colors hover:bg-primary/20"
          >
            Enter FinTrack →
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
            "radial-gradient(64% 58% at 50% 48%, hsl(33 90% 56% / 0.12), transparent 72%), radial-gradient(45% 40% at 22% 82%, hsl(156 46% 45% / 0.08), transparent 70%)",
        }}
      />

      {/* Rain layer — Hardware-accelerated CSS compositor transforms */}
      <div className="ft-rain-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {streams.map((stream) => {
          // Double stacking two viewport-spanning blocks for an infinite, seamlessly cascading rainfall loop
          const streamBlocks = [stream.glyphs, stream.glyphs];
          return (
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
                    "--fall-dur": `${stream.fallDuration}s`,
                    "--fall-delay": `${stream.fallDelay}s`,
                  } as React.CSSProperties
                }
              >
                {streamBlocks.map((block, bIdx) => (
                  <div key={bIdx} className="ft-rain-stream-block" aria-hidden="true">
                    {block.map((g, gIdx) => (
                      <span
                        key={gIdx}
                        className="ft-rain-glyph"
                        data-lead={g.isLead ? "true" : undefined}
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
                ))}
              </div>
            </div>
          );
        })}
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
          {(onComplete || onSkipToNext) && (
            <button
              type="button"
              onClick={onComplete || onSkipToNext}
              className="pointer-events-auto mt-7 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/12 px-6 py-2.5 text-xs font-semibold text-primary backdrop-blur-sm transition-colors hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Enter FinTrack
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Dynamic bottom redirect / skip bar */}
      <div className="absolute bottom-5 inset-x-0 z-30 flex items-center justify-between px-5 sm:px-8 pointer-events-auto">
        {onComplete ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs text-white/70 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
            <span>Redirecting to Sign In in {secondsRemaining}s</span>
          </div>
        ) : (
          <div />
        )}

        {(onComplete || onSkipToNext) && (
          <button
            type="button"
            onClick={onComplete || onSkipToNext}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition-colors hover:border-primary/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Skip to Sign In →
          </button>
        )}
      </div>
    </section>
  );
}
