import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const { updatePassword, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for error parameters in the URL fragment or query string
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(window.location.search);
    const err =
      hashParams.get("error_description") ||
      searchParams.get("error_description") ||
      hashParams.get("error") ||
      searchParams.get("error");

    if (err) {
      setLinkError(err.replace(/\+/g, " "));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    if (error) {
      toast.error(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      toast.success("Password updated successfully!");
      setLoading(false);
      setTimeout(() => {
        navigate("/");
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="glass-card p-8 w-full max-w-sm animate-fade-in border border-border/50 shadow-xl rounded-2xl">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <span className="font-heading font-bold text-2xl gradient-text">FinTrack</span>
        </div>

        {linkError ? (
          <div className="space-y-4 text-center">
            <div className="inline-flex p-3 rounded-full bg-destructive/10 text-destructive mb-2">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="font-heading font-semibold text-lg">Reset Link Expired</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {linkError || "This password reset link is invalid or has expired."}
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Link>
            </Button>
          </div>
        ) : success ? (
          <div className="space-y-4 text-center">
            <div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-500 mb-2">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="font-heading font-semibold text-lg text-emerald-500">Password Updated!</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your password has been reset securely. Redirecting you to your FinTrack dashboard...
            </p>
            <Button onClick={() => navigate("/")} className="w-full">
              Go to Dashboard
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-heading font-semibold text-lg text-center mb-2">Set New Password</h2>
            <p className="text-xs text-muted-foreground text-center mb-6">
              Enter your new password below to secure your FinTrack account.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-xs">New Password</Label>
                <div className="relative mt-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-secondary border-border pr-10"
                    placeholder="Min. 6 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Confirm Password</Label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="bg-secondary border-border mt-1"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
              <div className="text-center pt-2">
                <Link
                  to="/auth"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
