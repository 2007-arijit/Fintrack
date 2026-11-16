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
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  CalendarIcon,
  ArrowRightLeft,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function dueMeta(debt: Debt) {
  if (debt.status !== "active" || !debt.due_date) return null;
  const days = differenceInCalendarDays(parseISO(debt.due_date), new Date());
  if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, tone: "text-destructive" };
  if (days === 0) return { text: "Due today", tone: "text-warning" };
  if (days <= 7) return { text: `Due in ${days}d`, tone: "text-warning" };
  return { text: `Due ${format(parseISO(debt.due_date), "d MMM")}`, tone: "text-muted-foreground" };
}

export default function DebtPage() {
  const { debts, isLoading, addDebt, settleDebt, deleteDebt, totalReceivable, totalPayable } = useDebts();
  const { format: formatCurr } = useCurrency();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("type") === "payable" ? "payable" : "receivable";
  const [tab, setTab] = useState<"receivable" | "payable">(initialTab);
  const [showAdd, setShowAdd] = useState(false);
  const [settlingDebt, setSettlingDebt] = useState<Debt | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredDebts = debts.filter((d) => d.type === tab);
  const activeReceivable = debts.filter((d) => d.type === "receivable" && d.status === "active").length;
  const activePayable = debts.filter((d) => d.type === "payable" && d.status === "active").length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ledger"
        title="Debt Tracker"
        description="Money lent and money borrowed, kept honest until each balance reaches zero."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add debt
          </Button>
        }
      />

      {/* The summary cards double as the tab control: less chrome, more context. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={tab === "receivable"}
          onClick={() => setTab("receivable")}
          className={cn(
            "group rounded-2xl border p-5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab === "receivable"
              ? "border-success/35 bg-success/[0.055]"
              : "border-border bg-card hover:border-success/25 hover:bg-success/[0.025]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">Owed to you</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-success/10 text-success">
              <ArrowDownLeft className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="stat-amount mt-3 text-2xl text-foreground">{formatCurr(totalReceivable)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeReceivable} active {activeReceivable === 1 ? "receivable" : "receivables"}
          </p>
        </button>

        <button
          type="button"
          aria-pressed={tab === "payable"}
          onClick={() => setTab("payable")}
          className={cn(
            "group rounded-2xl border p-5 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab === "payable"
              ? "border-destructive/35 bg-destructive/[0.05]"
              : "border-border bg-card hover:border-destructive/25 hover:bg-destructive/[0.02]",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="eyebrow">You owe</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-destructive/10 text-destructive">
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <p className="stat-amount mt-3 text-2xl text-foreground">{formatCurr(totalPayable)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activePayable} active {activePayable === 1 ? "payable" : "payables"}
          </p>
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">
          {tab === "receivable" ? "Receivables" : "Payables"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {filteredDebts.length} {filteredDebts.length === 1 ? "record" : "records"}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-secondary/50" />
          ))}
        </div>
      ) : filteredDebts.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            title={`No ${tab} debts`}
            description={`You have no ${tab} debts. Add one to get started.`}
            actionLabel="Add Debt"
            onAction={() => setShowAdd(true)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDebts.map((d) => {
            const original = Number(d.original_amount);
            const remaining = Number(d.remaining_amount);
            const settled = Math.max(0, original - remaining);
            const progress = original > 0 ? (settled / original) * 100 : 0;
            const isReceivable = d.type === "receivable";
            const due = dueMeta(d);

            return (
              <article key={d.id} className="glass-card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-semibold",
                      isReceivable ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                    )}
                    aria-hidden="true"
                  >
                    {initials(d.person_name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-medium text-foreground">{d.person_name}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-medium",
                          d.status === "active"
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : "border-success/30 bg-success/10 text-success",
                        )}
                      >
                        {d.status === "active" ? "Active" : "Settled"}
                      </Badge>
                      {due && <span className={cn("text-[11px]", due.tone)}>{due.text}</span>}
                    </div>

                    {d.description && (
                      <p className="mt-1 text-sm leading-snug text-muted-foreground">{d.description}</p>
                    )}

                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Opened {format(parseISO(d.debt_date), "d MMM yyyy")}
                      {d.due_date && <> · due {format(parseISO(d.due_date), "d MMM yyyy")}</>}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="stat-amount text-base text-foreground">{formatCurr(remaining)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.status === "settled"
                        ? "settled"
                        : settled > 0
                          ? `of ${formatCurr(original)}`
                          : "remaining"}
                    </p>
                  </div>
                </div>

                {(settled > 0 || d.status === "settled") && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{formatCurr(settled)} settled</span>
                      <span className="tabular">{Math.min(progress, 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="bar-grow h-full rounded-full bg-success"
                        style={{ width: `${Math.max(Math.min(progress, 100), progress > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                  {d.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 border-border bg-card/40"
                      onClick={() => setSettlingDebt(d)}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                      Settle
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(d.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </article>
            );
          })}
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
            <div className="surface-flat space-y-1 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isReceivable ? "💰 You'll receive:" : "💰 You'll pay:"}</span>
                <span className={isReceivable ? "font-medium text-success" : "font-medium text-destructive"}>
                  {isReceivable ? "+" : "−"}{formatCurr(enteredAmount)}
                </span>
              </div>
              {preview.writtenOff > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">✍️ Written off:</span>
                  <span className="font-medium text-warning">{formatCurr(preview.writtenOff)}</span>
                </div>
              )}
              {preview.extra > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">🎁 Extra {isReceivable ? "received" : "paid"}:</span>
                  <span className="font-medium text-warning">{formatCurr(preview.extra)}</span>
                </div>
              )}
              {!preview.isFull && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">📋 Remaining after:</span>
                  <span className="font-medium text-foreground">{formatCurr(preview.remainingAfter)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">📊 Status:</span>
                <span className={preview.isFull ? "font-medium text-success" : "font-medium text-warning"}>
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
