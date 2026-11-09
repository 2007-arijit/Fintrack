import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass-card p-8 w-full max-w-sm animate-fade-in">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <span className="font-heading font-bold text-2xl gradient-text">FinTrack</span>
        </div>

        <h2 className="font-heading font-semibold text-lg text-center mb-6">
          {showForgot ? "Reset Password" : isLogin ? "Welcome back" : "Create account"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && !showForgot && (
            <div>
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Your name"
              />
            </div>
          )}
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-secondary border-border"
              placeholder="you@example.com"
            />
          </div>
          {!showForgot && (
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-secondary border-border"
                placeholder="••••••••"
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Please wait..."
              : showForgot
                ? "Send Reset Link"
                : isLogin
                  ? "Sign In"
                  : "Sign Up"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground space-y-2">
          {!showForgot && isLogin && (
            <div>
              <button
                onClick={() => setShowForgot(true)}
                className="hover:text-primary transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}
          <div>
            <button
              onClick={() => { setShowForgot(false); setIsLogin(!isLogin); }}
              className="hover:text-primary transition-colors"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
