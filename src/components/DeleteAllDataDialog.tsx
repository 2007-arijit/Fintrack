import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteFinancialData } from "@/hooks/useAccountDeletion";
import { Loader2, AlertTriangle } from "lucide-react";

interface DeleteAllDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAllDataDialog({ open, onOpenChange }: DeleteAllDataDialogProps) {
  const [password, setPassword] = useState("");
  const deleteFinancialData = useDeleteFinancialData();

  const handleClose = (o: boolean) => {
    if (!o) setPassword("");
    onOpenChange(o);
  };

  const handleConfirm = () => {
    deleteFinancialData.mutate(password, {
      onSuccess: () => handleClose(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Delete All Data
          </DialogTitle>
          <DialogDescription>
            This permanently deletes all transactions, budgets, and debts. Your account, profile, friends, and chats
            are kept. This cannot be undone — enter your current password to confirm.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="delete-all-password">Current Password</Label>
          <Input
            id="delete-all-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-secondary border-border"
            placeholder="Enter your password"
            onKeyDown={(e) => e.key === "Enter" && password && handleConfirm()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-border" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!password || deleteFinancialData.isPending}
            onClick={handleConfirm}
          >
            {deleteFinancialData.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Delete Everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
