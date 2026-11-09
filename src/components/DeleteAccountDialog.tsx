import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteAccount } from "@/hooks/useAccountDeletion";
import { Loader2, AlertTriangle, ShieldAlert } from "lucide-react";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONFIRM_PHRASE = "DELETE";

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const deleteAccount = useDeleteAccount();

  const handleClose = (o: boolean) => {
    if (!o) {
      setStep(1);
      setPhrase("");
      setPassword("");
    }
    onOpenChange(o);
  };

  const handleFinalConfirm = () => {
    deleteAccount.mutate(password, {
      onSuccess: () => {
        handleClose(false);
        navigate("/auth", { replace: true });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" /> Permanently Delete Account
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>This will permanently and irreversibly delete:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    <li>Your profile, transactions, budgets, and debts</li>
                    <li>Groups you created, including shared expenses, participants, and settlements (their group history is removed for every member)</li>
                    <li>Your memberships and participation records in other groups</li>
                    <li>Friends, friend requests, and chat history</li>
                    <li>Your login credentials — you will be signed out everywhere</li>
                  </ul>
                  <p className="text-destructive font-medium">This action cannot be undone.</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="border-border" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setStep(2)}>
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Are you absolutely sure?
              </DialogTitle>
              <DialogDescription>
                Type <span className="font-mono font-semibold text-foreground">{CONFIRM_PHRASE}</span> below to
                confirm permanent deletion of your account. Enter your current password to verify this request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="delete-account-phrase">Confirmation</Label>
                <Input
                  id="delete-account-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder={CONFIRM_PHRASE}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="delete-account-password">Current Password</Label>
                <Input
                  id="delete-account-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="Enter your current password"
                  autoComplete="current-password"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-border" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                variant="destructive"
                disabled={phrase !== CONFIRM_PHRASE || !password || deleteAccount.isPending}
                onClick={handleFinalConfirm}
              >
                {deleteAccount.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Permanently Delete My Account
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
