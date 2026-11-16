import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryDropdown } from "@/components/CategoryDropdown";
import { GroupMember } from "@/hooks/useGroups";
import { GroupExpense, GroupExpenseSplit, SaveExpenseInput, toEngineParticipants } from "@/hooks/useGroupExpenses";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Lock } from "lucide-react";
import { PERSONAL_EXPLANATION, planVisibilityChange, audienceIds, type Visibility } from "@/lib/splitVisibility";
import {
  computeAllocation, toMinor, fromMinor, minorDigits, DivisionMode, CustomBasis,
  DIVISION_MODE_HELP, DIVISION_MODE_LABEL, SplitError,
} from "@/lib/splitEngine";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { memberDisplayName } from "@/lib/memberDisplay";
import { ParticipantModeTag } from "./ParticipantModeTag";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: GroupMember[];
  currency: string;
  formatCurr: (n: number) => string;
  /** When set, the modal edits this expense (parent must remount via `key`). */
  expense?: { row: GroupExpense; splits: GroupExpenseSplit[] } | null;
  pending?: boolean;
  onSubmit: (data: Omit<SaveExpenseInput, "expenseId" | "expectedVersion">) => void;
}

const MODES: DivisionMode[] = ["per_person", "per_family", "custom", "selected", "personal"];
const BASES: { value: CustomBasis; label: string }[] = [
  { value: "amount", label: "Amounts" },
  { value: "percentage", label: "Percent" },
  { value: "weight", label: "Weights" },
];

export function AddGroupExpenseModal({ open, onOpenChange, members, currency, formatCurr, expense, pending, onSubmit }: Props) {
  const { user } = useAuth();
  const editing = !!expense;
  const me = members.find((m) => m.member_user_id === user?.id) ?? members.find((m) => m.is_you);
  const digits = minorDigits(currency);

  const orig = expense?.row;
  const origSplits = expense?.splits ?? [];
  const origVisibility: Visibility = orig?.visibility ?? "group";
  const base = orig;
  const origCustomValues = useMemo(() => {
    const out: Record<string, string> = {};
    if (orig?.division_mode === "custom") {
      for (const s of origSplits) {
        out[s.member_id] = String(orig.custom_basis === "amount" ? s.share_amount : s.share_units ?? s.weight ?? "");
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orig?.id]);

  const [personal, setPersonal] = useState(origVisibility === "participants");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [description, setDescription] = useState(base?.description ?? "");
  const [amount, setAmount] = useState(base ? String(base.amount) : "");
  const [category, setCategory] = useState(base?.category ?? "food");
  const [paidBy, setPaidBy] = useState(orig?.paid_by ?? me?.id ?? members[0]?.id ?? "");
  const [mode, setMode] = useState<DivisionMode>(orig?.division_mode === "personal" ? "personal" : orig?.division_mode ?? "per_person");
  const [basis, setBasis] = useState<CustomBasis>(orig?.custom_basis ?? "amount");
  const [date, setDate] = useState<Date>(base ? parseISO(base.expense_date) : new Date());
  const [notes, setNotes] = useState(base?.notes ?? "");
  const [eligible, setEligible] = useState<Record<string, boolean>>(
    orig ? Object.fromEntries(members.map((m) => [m.id, origSplits.some((s) => s.member_id === m.id)])) : Object.fromEntries(members.map((m) => [m.id, true]))
  );
  const [responsible, setResponsible] = useState(orig?.division_mode === "personal" ? origSplits[0]?.member_id ?? "" : me?.id ?? members[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>(origCustomValues);

  const amountValid = new RegExp(`^\\d+(\\.\\d{1,${Math.max(digits, 1)}})?$`).test(amount.trim()) && Number(amount) > 0 && (digits > 0 || !amount.includes("."));
  const totalMinor = amountValid ? toMinor(amount, currency) : 0;
  const eligibleIds = members.filter((m) => eligible[m.id]).map((m) => m.id);
  const participants = useMemo(() => toEngineParticipants(members), [members]);

  // Is the stored allocation still exactly what the user is asking for? Then keep it:
  // never silently re-split history with today's member counts.
  const unchanged = useMemo(() => {
    if (!orig) return false;
    if (totalMinor !== toMinor(orig.amount, currency) || mode !== orig.division_mode) return false;
    if (mode === "custom" && basis !== orig.custom_basis) return false;
    const a = [...(mode === "personal" ? [responsible] : eligibleIds)].sort().join(",");
    const b = origSplits.map((s) => s.member_id).sort().join(",");
    if (a !== b) return false;
    if (mode === "custom") return eligibleIds.every((id) => Number(values[id] ?? 0) === Number(origCustomValues[id] ?? 0));
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orig?.id, totalMinor, mode, basis, responsible, eligibleIds.join(","), JSON.stringify(values)]);

  const computed = useMemo(() => {
    if (!amountValid || unchanged) return { snapshot: null, error: null as string | null };
    try {
      const customValues: Record<string, number> = {};
      if (mode === "custom") {
        for (const id of eligibleIds) {
          const raw = values[id];
          const n = raw === undefined || raw === "" ? 0 : Number(raw);
          if (!Number.isFinite(n)) throw new SplitError("Enter valid numbers");
          customValues[id] = basis === "amount" ? toMinor(n, currency) : n;
        }
      }
      const snapshot = computeAllocation({
        mode, totalMinor, participants, eligibleIds, responsibleId: responsible, customBasis: basis, customValues,
      });
      return { snapshot, error: null };
    } catch (e) {
      return { snapshot: null, error: e instanceof SplitError ? e.message : "Invalid split" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountValid, unchanged, mode, basis, totalMinor, participants, responsible, eligibleIds.join(","), JSON.stringify(values)]);

  // What the preview rows show — always derived from the CURRENT inputs (or the stored
  // allocation when nothing relevant changed), never from a previous render's amount.
  const previewByMember: Record<string, number> | null = useMemo(() => {
    if (!amountValid) return null;
    if (unchanged) return Object.fromEntries(origSplits.map((s) => [s.member_id, s.share_amount]));
    if (!computed.snapshot) return null;
    return Object.fromEntries(computed.snapshot.allocations.map((a) => [a.participantId, fromMinor(a.shareMinor, currency)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountValid, unchanged, computed.snapshot, currency]);

  const canSubmit =
    !pending && description.trim().length > 0 && amountValid && !!paidBy && !computed.error && (unchanged || !!computed.snapshot);

  const targetVisibility: Visibility = personal ? "participants" : "group";
  const buildPayload = (): Omit<SaveExpenseInput, "expenseId" | "expectedVersion"> => ({
    description: description.trim(),
    amount: fromMinor(totalMinor, currency),
    category,
    paidBy,
    divisionMode: mode,
    customBasis: mode === "custom" ? basis : null,
    expenseDate: format(date, "yyyy-MM-dd"),
    notes: notes.trim() || undefined,
    visibility: targetVisibility,
    snapshot: unchanged ? null : computed.snapshot,
  });

  const plan = planVisibilityChange(origVisibility, targetVisibility);
  const handleSubmit = () => {
    if (!canSubmit) return;
    // Changing who can see an expense is never silent.
    if (editing && plan.needsConfirmation) {
      setConfirmOpen(true);
      return;
    }
    onSubmit(buildPayload());
  };

  // Who will be able to see it (shown live when "Personal" is ticked).
  const sharerIds = mode === "personal" ? [responsible] : eligibleIds;
  const audienceNames = audienceIds(paidBy, sharerIds).map((id) => memberDisplayName(members.find((m) => m.id === id), user?.id));

  const showRow = (id: string) => (mode === "personal" ? id === responsible : !!eligible[id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{editing ? "Edit Shared Expense" : "Add Expense"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Description *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="bg-secondary border-border" placeholder="Dinner, cab, groceries..." />
          </div>
          <div>
            <Label>Amount *</Label>
            <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-secondary border-border" placeholder="0.00" />
            {amount !== "" && !amountValid && <p className="text-xs text-destructive mt-1">Enter an amount greater than 0 with at most {digits} decimals</p>}
          </div>
          <div>
            <Label>Category</Label>
            <CategoryDropdown type="expense" value={category} onChange={setCategory} />
          </div>
          <div>
            <Label>Paid by *</Label>
            <Select value={paidBy} onValueChange={setPaidBy}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Who paid?" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{memberDisplayName(m, user?.id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left bg-secondary border-border">
                  <CalendarIcon className="mr-2 h-4 w-4" />{format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Division mode</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("py-2 rounded-lg text-xs font-medium transition-colors", mode === m ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}
                >
                  {DIVISION_MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2" data-testid="division-help">{DIVISION_MODE_HELP[mode]}</p>
          </div>

          {mode === "custom" && (
            <div className="grid grid-cols-3 gap-2">
              {BASES.map((b) => (
                <button key={b.value} type="button" onClick={() => setBasis(b.value)}
                  className={cn("py-1.5 rounded-md text-xs", basis === b.value ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                  {b.label}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2" role="group" aria-labelledby="who-shares">
            <Label id="who-shares">{mode === "personal" ? "Responsible participant" : "Who shares this expense?"}</Label>
            {mode === "personal" ? (
              <Select value={responsible} onValueChange={setResponsible}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{memberDisplayName(m, user?.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Checkbox checked={!!eligible[m.id]} onCheckedChange={(c) => setEligible((p) => ({ ...p, [m.id]: !!c }))} />
                  <span className="flex-1 min-w-0 text-sm truncate">
                    {memberDisplayName(m, user?.id)}{" "}
                    <ParticipantModeTag mode={m.participation_mode} memberCount={m.member_count} className="ml-1 align-middle" />
                  </span>
                  {mode === "custom" && eligible[m.id] && (
                    <Input type="text" inputMode="decimal" value={values[m.id] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [m.id]: e.target.value }))}
                      className="w-20 h-8 bg-secondary border-border text-sm" placeholder={basis === "percentage" ? "%" : basis === "weight" ? "wt" : "0.00"} />
                  )}
                </div>
              ))
            )}
          </div>

          {mode !== "personal" && eligibleIds.length === 0 && (
            <p className="text-xs text-destructive" role="alert">Select at least one participant to share this expense.</p>
          )}

          {/* Live allocation preview */}
          <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1" data-testid="allocation-preview">
            <p className="text-xs font-semibold text-muted-foreground">
              Allocation preview{unchanged ? " (stored — unchanged)" : ""}
            </p>
            {previewByMember ? (
              members.filter((m) => showRow(m.id) && previewByMember[m.id] !== undefined).map((m) => (
                <div key={m.id} className="flex justify-between text-sm">
                  <span className="truncate">{memberDisplayName(m, user?.id)}</span>
                  <span className="font-medium">{formatCurr(previewByMember[m.id])}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">{computed.error ?? "Enter an amount to see the split."}</p>
            )}
            {previewByMember && computed.error && <p className="text-xs text-destructive">{computed.error}</p>}
            {mode !== "personal" && members.some((m) => !eligible[m.id]) && (
              <p className="text-xs text-muted-foreground pt-1" data-testid="excluded-note">
                Not sharing (no charge): {members.filter((m) => !eligible[m.id]).map((m) => memberDisplayName(m, user?.id)).join(", ")}
              </p>
            )}
            {editing && !unchanged && (
              <p className="text-xs text-warning">This re-splits the expense using the participants' current member counts.</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-1.5">
            {editing && (
              <p className="text-xs text-muted-foreground" data-testid="current-visibility">
                Current visibility: <span className="font-semibold text-foreground">{origVisibility === "participants" ? "Only members sharing it" : "Shared with group"}</span>
              </p>
            )}
            <div className="flex items-start gap-2">
              <Checkbox id="personal-expense" checked={personal} onCheckedChange={(c) => setPersonal(!!c)} className="mt-0.5" />
              <Label htmlFor="personal-expense" className="text-sm leading-snug cursor-pointer">
                Personal expense — hide from members who aren't sharing it
              </Label>
            </div>
            {personal && (
              <div className="text-xs text-muted-foreground space-y-1" data-testid="personal-explainer">
                <p className="flex items-start gap-1.5"><Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {PERSONAL_EXPLANATION}</p>
                <p>Can see it: <span className="text-foreground font-medium">{audienceNames.length ? audienceNames.join(", ") : "—"}</span></p>
              </div>
            )}
          </div>

          <div>
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-secondary border-border" placeholder="Extra details..." />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 border-border" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button onClick={handleSubmit} className="flex-1" disabled={!canSubmit}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add Expense"}
            </Button>
          </div>
        </div>
      </DialogContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={plan.title ?? "Confirm"}
        description={plan.message ?? ""}
        confirmLabel={plan.confirmLabel ?? "Confirm"}
        onConfirm={() => { setConfirmOpen(false); onSubmit(buildPayload()); }}
      />
    </Dialog>
  );
}
