import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet,
  BookOpen,
  BarChart3,
  ShieldCheck,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRINCIPLES = [
  {
    icon: BookOpen,
    title: "One honest ledger",
    copy: "Income, spending and transfers in a single, searchable record.",
  },
  {
    icon: BarChart3,
    title: "Plans you can keep",
    copy: "Budgets, reports and shared expenses without the spreadsheet.",
  },
  {
    icon: ShieldCheck,
    title: "Check before you pay",
    copy: "PayShield flags risky links, messages and UPI IDs.",
  },
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp, resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (showForgot) {
      const { error } = await resetPassword(email);
      if (error) toast.error(error.message);
      else toast.success("Password reset email sent! Check your inbox.");
      setLoading(false);
      return;
    }

    const { error } = isLogin
      ? await signIn(email, password)
      : await signUp(email, password, displayName);

    if (error) {
      toast.error(error.message);
    } else if (!isLogin) {
      toast.success("Check your email to confirm your account!");
    }
    setLoading(false);
  };

  const heading = showForgot ? "Reset your password" : isLogin ? "Welcome back" : "Create your account";
  const subheading = showForgot
    ? "Enter the email on your account and we’ll send a secure reset link."
    : isLogin
      ? "Sign in to pick up exactly where you left off."
      : "A calmer way to see your money. It takes less than a minute.";

  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setShowForgot(false);
  };

  return (
    <div className="relative min-h-dvh bg-background lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      {/* Brand panel — editorial, not a marketing carousel. */}
      <aside className="relative hidden overflow-hidden border-r border-border/70 bg-atmosphere lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(120% 90% at 20% 0%, black 0%, transparent 72%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 20% 0%, black 0%, transparent 72%)",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight text-foreground">FinTrack</span>
        </div>

        <div className="relative max-w-lg">
          <p className="eyebrow">Private finance, made legible</p>
          <h1 className="mt-5 font-display text-[clamp(2.6rem,4.2vw,4.1rem)] font-medium leading-[1.02] tracking-[-0.035em] text-foreground">
            Clarity is a<br />
            financial
            <span className="text-primary"> advantage.</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            A quiet place to see what you earn, what you owe, and what you can safely spend — without
            stitching together five different apps.
          </p>

          <ul className="mt-10 space-y-5">
            {PRINCIPLES.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-card/60 text-primary">
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{item.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between gap-4 border-t border-border/70 pt-5 text-[11px] text-muted-foreground">
          <span>Private by design. Your data stays yours.</span>
          <span className="tabular">© {new Date().getFullYear()} FinTrack</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex min-h-dvh flex-col px-5 py-8 sm:px-8 lg:px-12">
        <div className="flex items-center gap-2.5 lg:hidden">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="font-heading text-base font-semibold tracking-tight">FinTrack</span>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[390px]">
            <p className="eyebrow">{showForgot ? "Account recovery" : isLogin ? "Sign in" : "Get started"}</p>
            <h2 className="mt-2 font-display text-[2rem] font-medium leading-tight tracking-[-0.03em] text-foreground">
              {heading}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subheading}</p>

            {!showForgot && (
              <div className="mt-7 flex gap-5 border-b border-border">
                <button
                  type="button"
                  aria-pressed={isLogin}
                  onClick={() => switchMode(true)}
                  className={cn(
                    "relative pb-2.5 text-sm font-medium transition-colors",
                    isLogin ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Sign in
                  {isLogin && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
                <button
                  type="button"
                  aria-pressed={!isLogin}
                  onClick={() => switchMode(false)}
                  className={cn(
                    "relative pb-2.5 text-sm font-medium transition-colors",
                    !isLogin ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Create account
                  {!isLogin && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />}
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {!isLogin && !showForgot && (
                <div className="space-y-1.5">
                  <Label htmlFor="display-name" className="text-xs text-muted-foreground">
                    Display name
                  </Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-11 border-border bg-secondary/40"
                    placeholder="How should we address you?"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 border-border bg-secondary/40"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              {!showForgot && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs text-muted-foreground">
                      Password
                    </Label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={() => setShowForgot(true)}
                        className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11 border-border bg-secondary/40 pr-10"
                      placeholder="••••••••"
                      autoComplete={isLogin ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {!isLogin && <p className="text-[11px] text-muted-foreground">At least 6 characters.</p>}
                </div>
              )}

              <Button type="submit" className="mt-2 h-11 w-full gap-2 text-sm" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {loading
                  ? "Please wait…"
                  : showForgot
                    ? "Send reset link"
                    : isLogin
                      ? "Sign in"
                      : "Create account"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {showForgot ? (
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to sign in
                </button>
              ) : (
                <p>
                  {isLogin ? "New to FinTrack?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(!isLogin)}
                    className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {isLogin ? "Create an account" : "Sign in"}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </p>
              )}
            </div>

            <div className="mt-8 border-t border-border/60 pt-5 text-center">
              <Link
                to="/vision"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                See the FinTrack vision
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground lg:hidden">
          Private by design. Your data stays yours.
        </p>
      </main>
    </div>
  );
}
