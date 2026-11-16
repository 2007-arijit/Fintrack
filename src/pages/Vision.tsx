import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { FinancialRainTimeline } from "@/components/visualizations/FinancialRainTimeline";
import { VISION_SLIDES } from "@/data/visionSlides";
import { useAuth } from "@/contexts/AuthContext";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";
import "@/styles/vision.css";

// The WebGL stage carries three.js, so it stays out of the route's first
// paint. It is only requested once the gallery is about to be shown.
const ZoomBlurGallery = lazy(() => import("@/components/visualizations/ZoomBlurGallery"));

const GALLERY_IMAGES = VISION_SLIDES.map((slide) => ({
  id: slide.id,
  src: slide.src,
  alt: slide.alt,
}));

const PRINCIPLES = [
  {
    icon: BookOpen,
    label: "One honest ledger",
    copy: "Every rupee, dollar and euro in a single searchable record.",
  },
  {
    icon: Users,
    label: "Shared without friction",
    copy: "Group expenses and debts reconciled to the smallest unit.",
  },
  {
    icon: ShieldCheck,
    label: "Safe before you send",
    copy: "PayShield reads the request before the money moves.",
  },
];

export default function Vision() {
  const { user } = useAuth();
  const reducedMotion = usePrefersReducedMotion();
  const galleryRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [introKey, setIntroKey] = useState(0);
  const [galleryMounted, setGalleryMounted] = useState(false);

  const count = VISION_SLIDES.length;
  const active = VISION_SLIDES[activeIndex] ?? VISION_SLIDES[0];
  const primaryHref = user ? "/" : "/auth";
  const primaryLabel = user ? "Open dashboard" : "Sign in";
  const sceneHref = user ? active.route : "/auth";

  useEffect(() => {
    const previous = document.title;
    document.title = "FinTrack — A quieter way to see your money";
    return () => {
      document.title = previous;
    };
  }, []);

  const scrollToGallery = useCallback(() => {
    setGalleryMounted(true);
    galleryRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [reducedMotion]);

  // The WebGL stage decodes five large textures and compiles its shaders on
  // mount. Defer that until the intro has handed off (or the user starts
  // scrolling toward it), so it never competes with the rain animation.
  useEffect(() => {
    if (galleryMounted) return;

    const mount = () => setGalleryMounted(true);
    const timer = window.setTimeout(mount, reducedMotion ? 0 : 4800);

    // #root is the scroll container, so listen in the capture phase.
    document.addEventListener("scroll", mount, { capture: true, passive: true, once: true });

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("scroll", mount, { capture: true });
    };
  }, [galleryMounted, reducedMotion]);

  const goToScene = useCallback(
    (direction: 1 | -1) => {
      setActiveIndex((current) => (current + direction + count) % count);
    },
    [count],
  );

  const replaySequence = useCallback(() => {
    setIntroKey((key) => key + 1);
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    document.getElementById("root")?.scrollTo({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [reducedMotion]);

  return (
    <div className="vision-page dark min-h-dvh bg-background text-foreground">
      <a
        href="#vision-gallery"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to the gallery
      </a>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-gradient-to-b from-black/60 via-black/20 to-transparent">
        <div className="pointer-events-auto flex items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
          <Link
            to={primaryHref}
            className="group flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            aria-label="FinTrack home"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.8)]">
              <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="font-heading text-lg font-semibold tracking-tight text-white">FinTrack</span>
            <span className="hidden rounded-full border border-white/15 bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/55 backdrop-blur-sm sm:inline">
              Vision
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={scrollToGallery}
              className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-3.5 py-2 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:inline-flex"
            >
              Skip intro
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <Link
              to={primaryHref}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-[0_10px_30px_-14px_hsl(var(--primary)/0.9)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:text-sm"
            >
              {primaryLabel}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <FinancialRainTimeline
          key={introKey}
          title="CLARITY IN EVERY NUMBER"
          subtitle="Income, spending and plans in one honest record"
          onSkipToNext={scrollToGallery}
        />

        <section
          id="vision-gallery"
          ref={galleryRef}
          aria-label="FinTrack scene gallery"
          className="vision-gallery relative h-dvh w-full overflow-hidden"
        >
          {galleryMounted ? (
            <Suspense
              fallback={
                <div className="h-full w-full bg-[#090807]" aria-hidden="true" />
              }
            >
              <ZoomBlurGallery
                images={GALLERY_IMAGES}
                activeIndex={activeIndex}
                onIndexChange={setActiveIndex}
                wheelMode="capture"
                globalKeyboard
                clickToNavigate
                className="h-full w-full"
              />
            </Suspense>
          ) : (
            <div className="h-full w-full" aria-hidden="true" />
          )}

          <div className="vision-vignette pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />
          <div className="vision-grain pointer-events-none absolute inset-0 z-[1]" aria-hidden="true" />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 px-5 pt-20 sm:px-10 sm:pt-24">
            <p className="eyebrow text-white/65">The FinTrack studies</p>
            <div className="text-right">
              <p className="tabular text-[11px] font-medium tracking-[0.2em] text-white/60">
                {active.indexLabel} <span className="text-white/30">/ 05</span>
              </p>
              <p className="mt-1 hidden text-[10px] uppercase tracking-[0.22em] text-white/30 sm:block">
                Scroll or use ← →
              </p>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-8 sm:px-10 sm:pb-12">
            <div className="flex flex-col gap-7">
              <div className="pointer-events-auto max-w-xl">
                <p className="eyebrow text-primary/90">
                  Scene {active.indexLabel} — {active.eyebrow}
                </p>
                <h2
                  key={`${active.id}-title`}
                  className="vision-caption-enter mt-3 font-display text-[clamp(2rem,4.3vw,3.55rem)] font-medium leading-[1.02] tracking-[-0.035em] text-white"
                >
                  {active.title}
                </h2>
                <p
                  key={`${active.id}-copy`}
                  className="vision-caption-enter mt-3 max-w-md text-[13px] leading-relaxed text-white/65 sm:text-sm"
                >
                  {active.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="pointer-events-auto flex items-center gap-2.5">
                  <Link
                    to={sceneHref}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/12 px-4 py-2 text-xs font-semibold text-primary backdrop-blur-sm transition-colors hover:border-primary/70 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  >
                    {user ? active.ctaLabel : "Sign in to explore"}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <Link
                    to={primaryHref}
                    className="hidden text-xs font-medium text-white/55 underline-offset-4 transition-colors hover:text-white hover:underline sm:inline"
                  >
                    {user ? "Back to FinTrack" : "Create an account"}
                  </Link>
                </div>

                <div className="pointer-events-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => goToScene(-1)}
                    aria-label="Previous scene"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/25 text-white/70 backdrop-blur-sm transition-colors hover:border-white/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToScene(1)}
                    aria-label="Next scene"
                    className="grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/25 text-white/70 backdrop-blur-sm transition-colors hover:border-white/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <nav
            aria-label="Choose a gallery scene"
            className="absolute right-8 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end gap-4 lg:flex"
          >
            {VISION_SLIDES.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Scene ${slide.indexLabel}: ${slide.title}`}
                aria-current={index === activeIndex}
                data-active={index === activeIndex}
                className={cn(
                  "vision-rail-dot rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
                )}
              />
            ))}
          </nav>
        </section>

        <section className="vision-close border-t border-border/60">
          <div className="mx-auto max-w-6xl px-6 py-24 sm:px-8 sm:py-32">
            <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
              <div>
                <p className="eyebrow text-primary">Beyond the motion</p>
                <h2 className="mt-5 max-w-2xl font-display text-[clamp(2.35rem,5vw,4.4rem)] font-medium leading-[0.98] tracking-[-0.04em] text-foreground">
                  A quieter way to
                  <br />
                  <span className="text-primary">see your money.</span>
                </h2>
                <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  FinTrack was built for the moment after the statement arrives — when the numbers should feel
                  legible, the plan should feel possible, and the next decision should take seconds, not evenings.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
                <Link
                  to={primaryHref}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_18px_44px_-20px_hsl(var(--primary)/0.9)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {user ? "Return to your dashboard" : "Create your FinTrack account"}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={replaySequence}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card/60 px-6 py-3.5 text-sm font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Replay the sequence
                </button>
              </div>
            </div>

            <dl className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
              {PRINCIPLES.map((item, index) => (
                <div key={item.label} className="bg-card p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
                      <item.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="tabular text-[10px] tracking-[0.24em] text-muted-foreground/60">
                      0{index + 1}
                    </span>
                  </div>
                  <dt className="mt-5 text-sm font-semibold text-foreground">{item.label}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{item.copy}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10 flex flex-col gap-3 border-t border-border/60 pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                Cinematic motion simplifies automatically when your device requests reduced motion.
              </p>
              <p className="tabular">© {new Date().getFullYear()} FinTrack. Private by design.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
