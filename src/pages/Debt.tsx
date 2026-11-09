import { useState, useMemo } from "react";
import { useDebts, Debt } from "@/hooks/useDebts";
import { useCurrency } from "@/contexts/CurrencyContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Plus, Trash2, CalendarIcon, HandCoins } from "lucide-react";
import { useSearchParams } from "react-router-dom";

export default function DebtPage() {
  const { debts, isLoading, addDebt, settleDebt, deleteDebt } = useDebts();
  const { format: formatCurr } = useCurrency();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("type") === "payable" ? "payable" : "receivable";
  const [tab, setTab] = useState<"receivable" | "payable">(initialTab);
  const [showAdd, setShowAdd] = useState(false);
  const [settlingDebt, setSettlingDebt] = useState<Debt | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredDebts = debts.filter((d) => d.type === tab);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-2xl">Debt Tracker</h1>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Add Debt
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("receivable")}
          className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "receivable" ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground")}
        >
          🟢 Receivable
        </button>
        <button
          onClick={() => setTab("payable")}
          className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            tab === "payable" ? "bg-destructive/20 text-destructive" : "bg-secondary text-muted-foreground")}
        >
          🔴 Payable
        </button>
      </div>

      {filteredDebts.length === 0 && !isLoading ? (
        <EmptyState
          title={`No ${tab} debts`}
          description={`You have no ${tab} debts. Add one to get started.`}
          actionLabel="Add Debt"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <div className="space-y-3">
          {filteredDebts.map((d) => (
            <div key={d.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{d.person_name}</span>
                    <Badge
                      variant={d.status === "active" ? "outline" : "default"}
                      className={d.status === "active" ? "border-warning text-warning" : "bg-success/20 text-success border-success/30"}
                    >
                      {d.status === "active" ? "ACTIVE" : "SETTLED"}
                    </Badge>
                  </div>
                  {d.description && <p className="text-sm text-muted-foreground mt-1">{d.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(parseISO(d.debt_date), "MMM dd, yyyy")}
                    {d.due_date && <> · Due: {format(parseISO(d.due_date), "MMM dd, yyyy")}</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-lg">{formatCurr(Number(d.original_amount))}</p>
                  {Number(d.remaining_amount) !== Number(d.original_amount) && (
                    <p className="text-xs text-muted-foreground">
                      Remaining: {formatCurr(Number(d.remaining_amount))}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {d.status === "active" && (
                  <Button size="sm" variant="outline" className="border-primary text-primary" onClick={() => setSettlingDebt(d)}>
                    <HandCoins className="h-3.5 w-3.5 mr-1" /> Settle
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(d.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddDebtModal open={showAdd} onOpenChange={setShowAdd} defaultTab={tab}
        onSubmit={(data) => { addDebt.mutate(data); setShowAdd(false); }} />

      {settlingDebt && (
        <SettleDebtModal
          open={!!settlingDebt}
          onOpenChange={(o) => !o && setSettlingDebt(null)}
          debt={settlingDebt}
          onSettle={(data) => { settleDebt.mutate(data); setSettlingDebt(null); }}
          formatCurr={formatCurr}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete Debt"
        description="Deleting this debt will also remove all linked transactions and reverse its effect on your balance. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteId) deleteDebt.mutate(deleteId); setDeleteId(null); }}
      />
    </div>
  );
}

/* ─── Add Debt Modal ─── */
function AddDebtModal({ open, onOpenChange, defaultTab, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  defaultTab: "receivable" | "payable"; onSubmit: (data: any) => void;
}) {
  const [type, setType] = useState<"receivable" | "payable">(defaultTab);
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [debtDate, setDebtDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [description, setDescription] = useState("");

  const reset = () => { setType(defaultTab); setPersonName(""); setAmount(""); setDebtDate(new Date()); setDueDate(undefined); setDescription(""); };
  const isR = type === "receivable";

  const handleSubmit = () => {
    if (!personName.trim() || !amount || Number(amount) <= 0) return;
    onSubmit({
      type, person_name: personName.trim(),
      original_amount: Number(amount), remaining_amount: Number(amount),
      debt_date: format(debtDate, "yyyy-MM-dd"),
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      description: description.trim() || null, status: "active",
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Add Debt</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["receivable", "payable"] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize",
                  type === t ? (t === "receivable" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive") : "bg-secondary text-muted-foreground")}>
                {t}
              </button>
            ))}
          </div>
          <div>
            <Label>{isR ? "Who owes you? *" : "Whom do you owe? *"}</Label>
            <Input value={personName} onChange={(e) => setPersonName(e.target.value)} className="bg-secondary border-border"
              placeholder={isR ? "Friend's name, colleague..." : "Lender's name, bank..."} />
          </div>
          <div>
            <Label>{isR ? "Amount You Lent *" : "Amount You Borrowed *"}</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-secondary border-border" placeholder="0.00" min="0" step="0.01" />
          </div>
          <div>
            <Label>{isR ? "Date You Gave the Money *" : "Date You Received the Money *"}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left bg-secondary border-border">
                  <CalendarIcon className="mr-2 h-4 w-4" />{format(debtDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={debtDate} onSelect={(d) => d && setDebtDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>{isR ? "Expected Return Date (optional)" : "Repayment Due Date (optional)"}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left bg-secondary border-border", !dueDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />{dueDate ? format(dueDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-secondary border-border"
              placeholder={isR ? "Purpose of lending..." : "Reason for borrowing..."} />
          </div>
          <Button onClick={handleSubmit} className="w-full" disabled={!personName.trim() || !amount || Number(amount) <= 0}>
            {isR ? "Add Receivable" : "Add Payable"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Settle Debt Modal ─── */
function SettleDebtModal({ open, onOpenChange, debt, onSettle, formatCurr }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  debt: Debt; onSettle: (data: any) => void; formatCurr: (n: number) => string;
}) {
  const [amount, setAmount] = useState("");
  const [settledAt, setSettledAt] = useState<Date>(new Date());
  const [note, setNote] = useState("");
  const [markFullySettled, setMarkFullySettled] = useState(false);

  const remaining = Number(debt.remaining_amount);
  const enteredAmount = Number(amount) || 0;
  const isPartial = enteredAmount > 0 && enteredAmount < remaining;
  const isReceivable = debt.type === "receivable";

  const preview = useMemo(() => {
    if (enteredAmount <= 0) return null;
    const isOver = enteredAmount > remaining;
    const isExact = enteredAmount === remaining;
    const isFull = isOver || isExact || markFullySettled;
    return {
      isFull,
      remainingAfter: isFull ? 0 : remaining - enteredAmount,
      extra: isOver ? enteredAmount - remaining : 0,
      writtenOff: isPartial && markFullySettled ? remaining - enteredAmount : 0,
    };
  }, [enteredAmount, remaining, markFullySettled, isPartial]);

  const handleSubmit = () => {
    if (enteredAmount <= 0) return;
    onSettle({ debt, amountSettled: enteredAmount, settledAt: format(settledAt, "yyyy-MM-dd"), note: note.trim() || undefined, markFullySettled });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle className="font-heading">Settle Debt — {debt.person_name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Remaining: <span className="font-semibold text-foreground">{formatCurr(remaining)}</span></p>
          <div>
            <Label>{isReceivable ? "Amount Received *" : "Amount Paid *"}</Label>
            <Input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setMarkFullySettled(false); }}
              className="bg-secondary border-border" placeholder="0.00" min="0" step="0.01" />
          </div>

          {preview && (
            <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isReceivable ? "💰 You'll receive:" : "💰 You'll pay:"}</span>
                <span className={isReceivable ? "text-[#22c55e] font-medium" : "text-[#ef4444] font-medium"}>
                  {isReceivable ? "+" : "−"}{formatCurr(enteredAmount)}
                </span>
              </div>
              {preview.writtenOff > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">✍️ Written off:</span>
                  <span className="text-[#f59e0b] font-medium">{formatCurr(preview.writtenOff)}</span>
                </div>
              )}
              {preview.extra > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🎁 Extra {isReceivable ? "received" : "paid"}:</span>
                  <span className="text-[#f59e0b] font-medium">{formatCurr(preview.extra)}</span>
                </div>
              )}
              {!preview.isFull && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">📋 Remaining after:</span>
                  <span className="text-foreground font-medium">{formatCurr(preview.remainingAfter)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">📊 Status:</span>
                <span className={preview.isFull ? "text-[#22c55e] font-medium" : "text-[#f59e0b] font-medium"}>
                  {preview.isFull ? "Fully Settled ✅" : "Still Active"}
                </span>
              </div>
            </div>
          )}

          {isPartial && (
            <div className="flex items-center gap-2">
              <Checkbox checked={markFullySettled} onCheckedChange={(c) => setMarkFullySettled(!!c)} id="mark-settled" />
              <label htmlFor="mark-settled" className="text-sm text-muted-foreground cursor-pointer">
                Mark entire debt as settled
              </label>
            </div>
          )}

          <div>
            <Label>Settlement Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left bg-secondary border-border">
                  <CalendarIcon className="mr-2 h-4 w-4" />{format(settledAt, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={settledAt} onSelect={(d) => d && setSettledAt(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-secondary border-border" placeholder="Settlement note" />
          </div>
          <Button onClick={handleSubmit} className="w-full" disabled={enteredAmount <= 0}>
            {isReceivable ? "Receive Payment" : "Record Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
