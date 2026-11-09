import { useState, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { exportTransactionsToCSV } from "@/lib/csvExport";
import { CurrencyCode } from "@/lib/formatCurrency";
import { validateUpiId } from "@/lib/upi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, DollarSign, Download, Trash2, Lock, RefreshCw, AtSign, Users, ShieldAlert, ImagePlus, Zap, ShieldCheck, LogOut } from "lucide-react";

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
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    const { error } = await updatePassword(newPassword);
    if (!error) { setNewPassword(""); toast.success("Password updated"); }
    else toast.error(error.message);
  };

  const handleRecalculateDebts = async () => {
    setRecalculating(true);
    try {
      const { data: debts } = await supabase.from("debts").select("*");
      if (!debts || debts.length === 0) { toast.info("No debts found"); return; }

      const { data: existingTx } = await supabase
        .from("transactions")
        .select("debt_id")
        .eq("source", "debt_auto")
        .not("debt_id", "is", null);

      const coveredIds = new Set((existingTx || []).map((t: any) => t.debt_id));
      const orphaned = debts.filter((d: any) => !coveredIds.has(d.id));

      if (orphaned.length === 0) { toast.info("All debts already have linked transactions"); return; }

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
    <div className="space-y-8 max-w-2xl animate-fade-in">
      <h1 className="font-heading font-bold text-2xl">Settings</h1>

      {/* Profile */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <User className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Profile</h2>
        </div>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border border-border">
            <AvatarImage src={preferences?.avatar_url || undefined} alt={preferences?.display_name || "Avatar"} />
            <AvatarFallback>{(preferences?.display_name || user?.email || "U").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <Button asChild variant="outline" className="border-border gap-1">
            <Link to="/settings/avatar">
              <ImagePlus className="h-4 w-4" /> Change Avatar
            </Link>
          </Button>
        </div>
        <div>
          <Label>Email</Label>
          <Input value={user?.email || ""} disabled className="bg-secondary border-border opacity-60" />
        </div>
        <div>
          <Label>Display Name</Label>
          <div className="flex gap-2">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-secondary border-border"
              placeholder="Your name"
            />
            <Button onClick={handleUpdateName} disabled={updatePreferences.isPending}>
              Save
            </Button>
          </div>
        </div>
        <div>
          <Label className="flex items-center gap-1"><AtSign className="h-3.5 w-3.5" /> Username</Label>
          <div className="flex gap-2">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="bg-secondary border-border disabled:opacity-40 disabled:cursor-not-allowed"
              placeholder="unique_username"
              disabled={usernameLocked}
            />
            <Button
              onClick={handleUpdateUsername}
              disabled={updatePreferences.isPending || usernameLocked}
              className="disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {preferences?.username
              ? "Friends can find you by this username."
              : "Choose a unique username — required so friends can find and add you for Split."}
          </p>
          {usernameLocked && (
            <p className="text-xs text-warning mt-1">
              Usernames can only be changed every 14 days. You can change it again in {usernameDaysLeft} day{usernameDaysLeft === 1 ? "" : "s"}.
            </p>
          )}
          {preferences?.username_updated_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Last Changed: {formatDate(new Date(preferences.username_updated_at), "dd-MMMM, yyyy")}
            </p>
          )}
          {preferences?.previous_username && (
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto text-primary gap-1"
              onClick={handleRevertUsername}
              disabled={updatePreferences.isPending}
            >
              <RefreshCw className="h-3 w-3" /> Revert to old username (@{preferences.previous_username})
            </Button>
          )}
        </div>
      </section>

      {/* Payments (UPI) */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Payments</h2>
        </div>
        <div>
          <Label>Your UPI ID</Label>
          <div className="flex gap-2">
            <Input
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              className="bg-secondary border-border"
              placeholder="yourname@okhdfcbank"
            />
            <Button onClick={handleUpdateUpi} disabled={updatePreferences.isPending || !upiValid}>
              Save
            </Button>
          </div>
          {!upiValid && <p className="text-xs text-destructive mt-1">That doesn't look like a valid UPI ID.</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {preferences?.upi_id
              ? "Friends can pay you directly — Settle Up will generate a QR code and payment link with this UPI ID."
              : "Add this so friends can pay you directly via Settle Up, with a scannable QR code and one-tap UPI link."}
          </p>
        </div>
      </section>

      {/* Developer Dashboard (only visible to developer accounts) */}
      {isDeveloper && (
        <Link
          to="/dev"
          className="glass-card p-4 flex items-center gap-3 hover:bg-secondary/40 transition-colors border-primary/30"
        >
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Developer Dashboard</p>
            <p className="text-xs text-muted-foreground">Users, presence, blocking, push notifications</p>
          </div>
        </Link>
      )}

      {/* Friends */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Friends</h2>
        </div>
        <FriendsPanel />
      </section>

      {/* Password */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Change Password</h2>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="bg-secondary border-border"
            placeholder="New password (min 6 chars)"
          />
          <Button onClick={handleUpdatePassword}>Update</Button>
        </div>
      </section>

      {/* Currency */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Currency</h2>
        </div>
        <CurrencySelector value={currency} onChange={(v) => setCurrency(v as CurrencyCode)} />
        <p className="text-xs text-muted-foreground">Currency is applied to all amounts across the app.</p>
      </section>

      {/* Data management */}
      <section className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Download className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">Data Management</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-border" onClick={() => exportTransactionsToCSV(transactions)}>
            <Download className="h-4 w-4 mr-1" /> Export All Transactions
          </Button>
          <Button variant="outline" className="border-border" onClick={handleRecalculateDebts} disabled={recalculating}>
            <RefreshCw className={`h-4 w-4 mr-1 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Recalculating..." : "Fix Debt Transactions"}
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteAll(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Delete All Data
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          "Fix Debt Transactions" repairs balance if debt-linked transactions are missing. Deleting all data requires
          your current password.
        </p>
      </section>

      {/* Log out (also reachable on mobile, where the sidebar is hidden) */}
      <section className="glass-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Log out</p>
            <p className="text-xs text-muted-foreground">Sign out of FinTrack on this device.</p>
          </div>
          <Button variant="outline" className="shrink-0 gap-1 border-border" onClick={() => setShowLogout(true)}>
            <LogOut className="h-4 w-4" /> Log out
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={showLogout}
        onOpenChange={setShowLogout}
        title="Log out?"
        description="You'll need to sign in again to see your data."
        confirmLabel="Log out"
        onConfirm={async () => { setShowLogout(false); await signOut(); }}
      />

      {/* Danger Zone */}
      <section className="glass-card p-6 space-y-4 border-destructive/30">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <h2 className="font-heading font-semibold text-lg text-destructive">Danger Zone</h2>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4">
          <div>
            <p className="text-sm font-medium">Permanently Delete Account</p>
            <p className="text-xs text-muted-foreground">
              Deletes your account, login, and every piece of data you own. Irreversible.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setShowDeleteAccount(true)} className="shrink-0">
            Delete Account
          </Button>
        </div>
      </section>

      <DeleteAllDataDialog open={showDeleteAll} onOpenChange={setShowDeleteAll} />
      <DeleteAccountDialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount} />
    </div>
  );
}
