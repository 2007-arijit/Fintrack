import { PaymentLabel } from "@/components/CategoryIcon";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryDropdown } from "./CategoryDropdown";
import { PAYMENT_METHODS } from "@/lib/categoryConfig";
import { Transaction } from "@/hooks/useTransactions";
import { useDebts } from "@/hooks/useDebts";
import { cn } from "@/lib/utils";

// Categories picked directly in the Add Transaction form that represent a
// brand-new debt being created. Selecting one of these offers to track the
// debt in the Debt tab (payable/receivable) instead of logging a plain,
// unlinked transaction.
const DEBT_CREATE_MAP: Record<string, "receivable" | "payable"> = {
  debt_money_lent: "receivable",
  debt_money_borrowed: "payable",
};

// Categories that represent settling a debt that (presumably) already
// exists. Selecting one of these offers to apply the payment against an
// existing active debt so it's reflected in the Debt tab.
const DEBT_SETTLE_MAP: Record<string, "receivable" | "payable"> = {
  debt_payment_paid_back: "payable",
  debt_recovery_received: "receivable",
};

const schema = z
  .object({
    type: z.enum(["income", "expense"]),
    amount: z.coerce.number().positive("Amount must be positive"),
    category: z.string().min(1, "Category required"),
    custom_category: z.string().optional(),
    description: z.string().max(500).optional(),
    date: z.string().min(1, "Date required"),
    payment_method: z.string().optional(),
  })
  .refine(
    (data) => {
      if (
        (data.category === "other_expense" || data.category === "other_income") &&
        !data.custom_category?.trim()
      ) {
        return false;
      }
      return true;
    },
    { message: "Please specify a custom category", path: ["custom_category"] }
  );

type FormData = z.infer<typeof schema>;

interface TransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    type: "income" | "expense";
    amount: number;
    category: string;
    custom_category?: string;
    description?: string;
    date: string;
    payment_method?: string;
  }) => void;
  defaultValues?: Partial<Transaction>;
  loading?: boolean;
}

export function TransactionModal({ open, onOpenChange, onSubmit, defaultValues, loading }: TransactionModalProps) {
  const isEditing = !!defaultValues?.id;
  const { debts, addDebt, settleDebt } = useDebts();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: defaultValues?.type || "expense",
      amount: defaultValues?.amount || undefined,
      category: defaultValues?.category || "",
      custom_category: defaultValues?.custom_category || "",
      description: defaultValues?.description || "",
      date: defaultValues?.date || new Date().toISOString().split("T")[0],
      payment_method: defaultValues?.payment_method || "cash",
    },
  });

  const type = watch("type");
  const category = watch("category");
  const isOther = category === "other_expense" || category === "other_income";

  // Debt linking state — only relevant for new (non-edit) transactions.
  const [linkToDebt, setLinkToDebt] = useState(true);
  const [personName, setPersonName] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [selectedDebtId, setSelectedDebtId] = useState("");

  const debtCreateType = !isEditing ? DEBT_CREATE_MAP[category] : undefined;
  const debtSettleType = !isEditing ? DEBT_SETTLE_MAP[category] : undefined;
  const isDebtCreate = !!debtCreateType;
  const isDebtSettle = !!debtSettleType;

  const settleCandidates = useMemo(
    () => (debtSettleType ? debts.filter((d) => d.type === debtSettleType && d.status === "active") : []),
    [debts, debtSettleType]
  );

  // Reset the debt-linking fields whenever the modal is (re)opened so a
  // previous entry's name/date doesn't linger for the next transaction.
  useEffect(() => {
    if (open) {
      setLinkToDebt(true);
      setPersonName("");
      setDueDate(undefined);
      setSelectedDebtId("");
    }
  }, [open]);

  const busy = !!loading || addDebt.isPending || settleDebt.isPending;

  const handleFormSubmit = (data: FormData) => {
    if (isDebtCreate && linkToDebt && debtCreateType) {
      if (!personName.trim()) return;
      addDebt.mutate({
        type: debtCreateType,
        person_name: personName.trim(),
        original_amount: data.amount,
        remaining_amount: data.amount,
        debt_date: data.date,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        description: data.description?.trim() || null,
        status: "active",
      });
    } else if (isDebtSettle && linkToDebt) {
      const debt = settleCandidates.find((d) => d.id === selectedDebtId);
      if (!debt) return;
      settleDebt.mutate({
        debt,
        amountSettled: data.amount,
        settledAt: data.date,
        note: data.description?.trim() || undefined,
      });
    } else {
      onSubmit(
        data as {
          type: "income" | "expense";
          amount: number;
          category: string;
          custom_category?: string;
          description?: string;
          date: string;
          payment_method?: string;
        }
      );
    }
    reset();
    onOpenChange(false);
  };

  const submitDisabled =
    busy ||
    (isDebtCreate && linkToDebt && !personName.trim()) ||
    (isDebtSettle && linkToDebt && !selectedDebtId);

  const submitLabel = busy
    ? "Saving..."
    : isEditing
    ? "Update Transaction"
    : isDebtCreate && linkToDebt
    ? "Add & Track Debt"
    : isDebtSettle && linkToDebt
    ? "Record Settlement"
    : "Add Transaction";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md top-[4vh] translate-y-0 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{isEditing ? "Edit" : "Add"} Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              onClick={() => {
                setValue("type", "expense");
                setValue("category", "");
              }}
              className={type === "expense" ? "bg-destructive hover:bg-destructive/90" : "border-border"}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              onClick={() => {
                setValue("type", "income");
                setValue("category", "");
              }}
              className={type === "income" ? "bg-success hover:bg-success/90" : "border-border"}
            >
              Income
            </Button>
          </div>

          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              {...register("amount")}
              className="bg-secondary border-border"
              placeholder="0.00"
            />
            {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>}
          </div>

          <div>
            <Label>Category</Label>
            <CategoryDropdown type={type} value={category} onChange={(v) => setValue("category", v)} />
            {errors.category && <p className="text-xs text-destructive mt-1">{errors.category.message}</p>}
          </div>

          {isOther && (
            <div>
              <Label>Custom Category</Label>
              <Input
                {...register("custom_category")}
                className="bg-secondary border-border"
                placeholder="Specify category"
              />
              {errors.custom_category && (
                <p className="text-xs text-destructive mt-1">{errors.custom_category.message}</p>
              )}
            </div>
          )}

          {isDebtCreate && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="link-debt-create"
                  checked={linkToDebt}
                  onCheckedChange={(c) => setLinkToDebt(!!c)}
                />
                <label htmlFor="link-debt-create" className="text-sm cursor-pointer">
                  Track this in Debts ({debtCreateType === "receivable" ? "money owed to you" : "money you owe"})
                </label>
              </div>
              {linkToDebt && (
                <>
                  <div>
                    <Label>{debtCreateType === "receivable" ? "Who owes you? *" : "Whom do you owe? *"}</Label>
                    <Input
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      className="bg-background border-border"
                      placeholder={debtCreateType === "receivable" ? "Friend's name, colleague..." : "Lender's name, bank..."}
                    />
                  </div>
                  <div>
                    <Label>Repayment Due Date (optional — leave blank if uncertain)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal bg-background border-border",
                            !dueDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dueDate ? format(dueDate, "PPP") : "Uncertain / not set"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dueDate}
                          onSelect={setDueDate}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}
            </div>
          )}

          {isDebtSettle && (
            <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="link-debt-settle"
                  checked={linkToDebt}
                  onCheckedChange={(c) => setLinkToDebt(!!c)}
                />
                <label htmlFor="link-debt-settle" className="text-sm cursor-pointer">
                  Apply this to an existing tracked debt
                </label>
              </div>
              {linkToDebt && (
                <div>
                  <Label>Which debt is this for? *</Label>
                  {settleCandidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      No active {debtSettleType} debts found. Uncheck above to log this as a plain transaction, or
                      add the debt first from the Debt tab.
                    </p>
                  ) : (
                    <Select value={selectedDebtId} onValueChange={setSelectedDebtId}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select a debt" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {settleCandidates.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.person_name} — {Number(d.remaining_amount).toFixed(2)} remaining
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Description (optional)</Label>
            <Textarea
              {...register("description")}
              className="bg-secondary border-border resize-none"
              rows={2}
              placeholder="What was this for?"
            />
          </div>

          <div>
            <Label>Date</Label>
            <Input type="date" {...register("date")} className="bg-secondary border-border" />
            {errors.date && <p className="text-xs text-destructive mt-1">{errors.date.message}</p>}
          </div>

          <div>
            <Label>Payment Method</Label>
            <Select value={watch("payment_method")} onValueChange={(v) => setValue("payment_method", v)}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <PaymentLabel method={m.value} label={m.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="w-full" disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
