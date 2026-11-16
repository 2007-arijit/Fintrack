import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useUserPreferences, usernameCooldownDaysLeft } from "@/hooks/useUserPreferences";
import { useIsDeveloper } from "@/hooks/useIsDeveloper";
import { format as formatDate } from "date-fns";
import { useTransactions } from "@/hooks/useTransactions";
import { CurrencySelector } from "@/components/CurrencySelector";
import { FriendsPanel } from "@/components/FriendsPanel";
import { DeleteAllDataDialog } from "@/components/DeleteAllDataDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { exportTransactionsToCSV } from "@/lib/csvExport";
import { CurrencyCode } from "@/lib/formatCurrency";
import { validateUpiId } from "@/lib/upi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  User,
  Download,
  Trash2,
  Lock,
  RefreshCw,
  AtSign,
  Users,
  ShieldAlert,
  ImagePlus,
  Zap,
  ShieldCheck,
  LogOut,
  SlidersHorizontal,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "payments", label: "Payments" },
  { id: "friends", label: "Friends" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
  { id: "data", label: "Data" },
  { id: "account", label: "Account" },
];

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  danger,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "glass-card scroll-mt-24 overflow-hidden",
        danger && "border-destructive/30",
      )}
    >
      <div className={cn("border-b border-border/70 px-5 py-4 sm:px-6", danger && "border-destructive/20")}>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
              danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className={cn("text-sm font-semibold text-foreground", danger && "text-destructive")}>
              {title}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { user, updatePassword, signOut } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const { currency, setCurrency } = useCurrency();
  const { preferences, updatePreferences, changeUsername, revertUsername } = useUserPreferences();
  const { transactions } = useTransactions();
  const { isDeveloper } = useIsDeveloper();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [upiId, setUpiId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  useEffect(() => {
    if (preferences?.display_name) setDisplayName(preferences.display_name);
    if (preferences?.username) setUsername(preferences.username);
    setUpiId(preferences?.upi_id ?? "");
  }, [preferences]);

  const handleUpdateName = () => {
    if (!displayName.trim()) return;
    updatePreferences.mutate({ display_name: displayName.trim() });
  };

  const upiTrimmed = upiId.trim();
  const upiValid = upiTrimmed === "" || validateUpiId(upiTrimmed);

  const handleUpdateUpi = () => {
    if (!upiValid) return;
    updatePreferences.mutate({ upi_id: upiTrimmed || null });
  };

  const usernameDaysLeft = usernameCooldownDaysLeft(preferences?.username_updated_at);
  const usernameLocked = usernameDaysLeft > 0;

  const handleUpdateUsername = () => {
    if (usernameLocked) return;
    changeUsername(username);
  };

  const handleRevertUsername = () => {
    revertUsername();
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const { error } = await updatePassword(newPassword);
    if (!error) {
      setNewPassword("");
      toast.success("Password updated");
    } else toast.error(error.message);
  };

  const handleRecalculateDebts = async () => {
    setRecalculating(true);
    try {
      const { data: debts } = await supabase.from("debts").select("*");
      if (!debts || debts.length === 0) {
        toast.info("No debts found");
        return;
      }

      const { data: existingTx } = await supabase
        .from("transactions")
        .select("debt_id")
        .eq("source", "debt_auto")
        .not("debt_id", "is", null);

      const coveredIds = new Set((existingTx || []).map((t: any) => t.debt_id));
      const orphaned = debts.filter((d: any) => !coveredIds.has(d.id));

      if (orphaned.length === 0) {
        toast.info("All debts already have linked transactions");
        return;
      }

      const txRows = orphaned.map((d: any) => {
        const isReceivable = d.type === "receivable";
        return {
          user_id: d.user_id,
          type: isReceivable ? "expense" : "income",
          amount: d.original_amount,
          category: isReceivable ? "debt_money_lent" : "debt_money_borrowed",
          description: isReceivable
            ? `Lent to ${d.person_name}${d.description ? " — " + d.description : ""}`
            : `Borrowed from ${d.person_name}${d.description ? " — " + d.description : ""}`,
          date: d.debt_date,
          payment_method: "cash",
          source: "debt_auto",
          debt_id: d.id,
        };
      });

      const { error } = await supabase.from("transactions").insert(txRows);
      if (error) throw error;
      toast.success(`Fixed ${orphaned.length} orphaned debt transaction(s)`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your identity, payment details and the way FinTrack behaves. Only the essentials are here."
      />

      {/* Mobile index */}
      <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:hidden" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-10">
        {/* Desktop index */}
        <nav className="hidden self-start lg:sticky lg:top-4 lg:block" aria-label="Settings sections">
          <p className="eyebrow mb-3">On this page</p>
          <ul className="space-y-0.5 border-l border-border">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-3 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          <Section
            id="profile"
            icon={User}
            title="Profile"
            description="How you appear across FinTrack and to friends you split with."
          >
            <div className="flex flex-wrap items-center gap-4">
              <Avatar className="h-16 w-16 border border-border">
                <AvatarImage
                  src={preferences?.avatar_url || undefined}
                  alt={preferences?.display_name || "Avatar"}
                />
                <AvatarFallback>
                  {(preferences?.display_name || user?.email || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <Button asChild variant="outline" className="gap-1.5 border-border">
                  <Link to="/settings/avatar">
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    Change avatar
                  </Link>
                </Button>
                <p className="text-[11px] text-muted-foreground">Square image, at least 256 × 256 px.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="settings-email">Email</Label>
                <Input
                  id="settings-email"
                  value={user?.email || ""}
                  disabled
                  className="border-border bg-secondary/40 opacity-70"
                />
                <p className="text-[11px] text-muted-foreground">Used for signing in and account recovery.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="settings-display-name">Display name</Label>
                <div className="flex gap-2">
                  <Input
                    id="settings-display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="border-border bg-secondary/40"
                    placeholder="Your name"
                  />
                  <Button onClick={handleUpdateName} disabled={updatePreferences.isPending}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="settings-username" className="flex items-center gap-1">
                  <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
                  Username
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="settings-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    className="border-border bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-40"
                    placeholder="unique_username"
                    disabled={usernameLocked}
                  />
                  <Button
                    onClick={handleUpdateUsername}
                    disabled={updatePreferences.isPending || usernameLocked}
                    className="disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {preferences?.username
                    ? "Friends can find you by this username."
                    : "Choose a unique username — required so friends can find and add you for Split."}
                </p>
                {usernameLocked && (
                  <p className="text-[11px] text-warning">
                    Usernames can only be changed every 14 days. You can change it again in {usernameDaysLeft} day
                    {usernameDaysLeft === 1 ? "" : "s"}.
                  </p>
                )}
                {preferences?.username_updated_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Last changed {formatDate(new Date(preferences.username_updated_at), "d MMMM yyyy")}
                  </p>
                )}
                {preferences?.previous_username && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto gap-1 px-0 text-primary"
                    onClick={handleRevertUsername}
                    disabled={updatePreferences.isPending}
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Revert to old username (@{preferences.previous_username})
                  </Button>
                )}
              </div>
            </div>
          </Section>

          <Section
            id="payments"
            icon={Zap}
            title="Payments"
            description="The UPI address friends can use when settling a shared expense with you."
          >
            <div className="space-y-1.5">
              <Label htmlFor="settings-upi">Your UPI ID</Label>
              <div className="flex gap-2">
                <Input
                  id="settings-upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  className="border-border bg-secondary/40"
                  placeholder="yourname@okhdfcbank"
                />
                <Button onClick={handleUpdateUpi} disabled={updatePreferences.isPending || !upiValid}>
                  Save
                </Button>
              </div>
              {!upiValid && <p className="text-[11px] text-destructive">That doesn’t look like a valid UPI ID.</p>}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {preferences?.upi_id
                  ? "Friends can pay you directly — Settle Up will generate a QR code and payment link with this UPI ID."
                  : "Add this so friends can pay you directly via Settle Up, with a scannable QR code and one-tap UPI link."}
              </p>
            </div>
          </Section>

          {isDeveloper && (
            <Link
              to="/dev"
              className="glass-card card-interactive flex items-center gap-3 border-primary/25 p-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">Developer dashboard</span>
                <span className="block text-xs text-muted-foreground">
                  Users, presence, blocking, push notifications
                </span>
              </span>
            </Link>
          )}

          <Section
            id="friends"
            icon={Users}
            title="Friends"
            description="People you can split expenses with and message inside FinTrack."
          >
            <FriendsPanel />
          </Section>

          <Section
            id="security"
            icon={Lock}
            title="Security"
            description="Update the password used to sign in on this and other devices."
          >
            <div className="space-y-1.5">
              <Label htmlFor="settings-password">New password</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="settings-password"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="border-border bg-secondary/40 pr-10"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button onClick={handleUpdatePassword} disabled={newPassword.length === 0}>
                  Update
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Choose something you don’t use elsewhere. Your existing password keeps working until you change it.
              </p>
            </div>
          </Section>

          <Section
            id="preferences"
            icon={SlidersHorizontal}
            title="Preferences"
            description="Display and formatting choices applied across the whole app."
          >
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <CurrencySelector value={currency} onChange={(v) => setCurrency(v as CurrencyCode)} />
              <p className="text-[11px] text-muted-foreground">
                Applies to every amount, chart axis and export.
              </p>
            </div>
          </Section>

          <Section
            id="data"
            icon={Download}
            title="Data"
            description="Take a copy of your ledger, or repair debt-linked records."
          >
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-1.5 border-border"
                onClick={() => exportTransactionsToCSV(transactions)}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export all transactions
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 border-border"
                onClick={handleRecalculateDebts}
                disabled={recalculating}
              >
                <RefreshCw
                  className={cn("h-4 w-4", recalculating && "animate-spin")}
                  aria-hidden="true"
                />
                {recalculating ? "Recalculating…" : "Fix debt transactions"}
              </Button>
              <Button variant="destructive" className="gap-1.5" onClick={() => setShowDeleteAll(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete all data
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              “Fix debt transactions” repairs your balance if a debt-linked transaction is missing. Deleting all
              data requires your current password.
            </p>
          </Section>

          <Section
            id="account"
            icon={LogOut}
            title="Account"
            description="Sign out of this device, or permanently close your account."
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Log out</p>
                <p className="text-xs text-muted-foreground">You’ll need to sign in again to see your data.</p>
              </div>
              <Button
                variant="outline"
                className="shrink-0 gap-1.5 border-border"
                onClick={() => setShowLogout(true)}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/25 bg-destructive/[0.04] p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  Permanently delete account
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Deletes your account, login and every piece of data you own. Irreversible.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteAccount(true)}
                className="shrink-0"
              >
                Delete account
              </Button>
            </div>
          </Section>
        </div>
      </div>

      <ConfirmDialog
        open={showLogout}
        onOpenChange={setShowLogout}
        title="Log out?"
        description="You'll need to sign in again to see your data."
        confirmLabel="Log out"
        onConfirm={async () => {
          setShowLogout(false);
          await signOut();
        }}
      />

      <DeleteAllDataDialog open={showDeleteAll} onOpenChange={setShowDeleteAll} />
      <DeleteAccountDialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount} />
    </div>
  );
}
