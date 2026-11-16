import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GroupMember } from "@/hooks/useGroups";
import { useGroupPaymentInfo } from "@/hooks/useGroupPaymentInfo";
import { useAuth } from "@/contexts/AuthContext";
import { memberDisplayName } from "@/lib/memberDisplay";
import { buildUpiDeepLink } from "@/lib/upi";
import { format } from "date-fns";
import { CalendarIcon, Zap, QrCode, AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";

interface SettleUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: GroupMember[];
  groupId: string;
  groupName: string;
  formatCurr?: (n: number) => string;
  defaultFrom?: string;
  defaultTo?: string;
  defaultAmount?: number;
  onSubmit: (data: { fromMemberId: string; toMemberId: string; amount: number; settledAt: string; note?: string }) => void;
}

export function SettleUpModal({
  open,
  onOpenChange,
  members,
  groupId,
  groupName,
  formatCurr,
  defaultFrom,
  defaultTo,
  defaultAmount,
  onSubmit,
}: SettleUpModalProps) {
  const { user } = useAuth();
  const { upiIdFor } = useGroupPaymentInfo(groupId);

  const [step, setStep] = useState<"details" | "pay">("details");
  const [fromId, setFromId] = useState(defaultFrom ?? members[0]?.id ?? "");
  const [toId, setToId] = useState(defaultTo ?? members[1]?.id ?? "");
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : "");
  const [date, setDate] = useState<Date>(new Date());
  const [note, setNote] = useState("");
  const [showQr, setShowQr] = useState(true);

  useEffect(() => {
    if (open) {
      setStep("details");
      setFromId(defaultFrom ?? members[0]?.id ?? "");
      setToId(defaultTo ?? members[1]?.id ?? "");
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setDate(new Date());
      setNote("");
      setShowQr(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultFrom, defaultTo, defaultAmount]);

  const enteredAmount = Number(amount) || 0;
  const canSubmit = fromId && toId && fromId !== toId && enteredAmount > 0;

  const toMember = members.find((m) => m.id === toId);
  const toName = memberDisplayName(toMember, user?.id);
  const toUpiId = toMember ? upiIdFor(toMember.member_user_id) : null;
  const canPayViaUpi = !!toUpiId && canSubmit;

  const deepLink = toUpiId
    ? buildUpiDeepLink({
        upiId: toUpiId,
        name: toMember?.name ?? toName,
        amount: enteredAmount,
        note: note.trim() || `Settle up — ${groupName}`,
      })
    : "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ fromMemberId: fromId, toMemberId: toId, amount: enteredAmount, settledAt: format(date, "yyyy-MM-dd"), note: note.trim() || undefined });
  };

  const display = formatCurr ?? ((n: number) => n.toFixed(2));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        {step === "details" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">Settle Up</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From (paying)</Label>
                  <Select value={fromId} onValueChange={setFromId}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{memberDisplayName(m, user?.id)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To (receiving)</Label>
                  <Select value={toId} onValueChange={setToId}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{memberDisplayName(m, user?.id)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {fromId === toId && <p className="text-xs text-destructive">Choose two different members</p>}

              <div>
                <Label>Amount to pay back *</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-secondary border-border" placeholder="0.00" min="0" step="0.01" />
              </div>

              {canSubmit && !toUpiId && (
                <div className="flex gap-2 items-start p-3 rounded-lg border border-warning/30 bg-warning/10">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-snug">
                    {toName} hasn't added a UPI ID yet, so a payment QR can't be generated. You can still record this settlement manually below, or ask them to add their UPI ID in Settings.
                  </p>
                </div>
              )}

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
                <Label>Note (optional)</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-secondary border-border" placeholder="Settlement note" />
              </div>

              <div className="space-y-2">
                <Button onClick={() => setStep("pay")} className="w-full gap-1.5" disabled={!canPayViaUpi}>
                  <Zap className="h-4 w-4" /> Continue to Pay via UPI
                </Button>
                <Button onClick={handleSubmit} variant="outline" className="w-full border-border" disabled={!canSubmit}>
                  Record Without UPI
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button size="icon" variant="ghost" className="h-7 w-7 -ml-1" onClick={() => setStep("details")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle className="font-heading">Pay via UPI</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-5">
              <div className="glass-card p-6 text-center">
                <p className="text-xs text-muted-foreground">You're paying</p>
                <p className="text-lg font-bold mt-1">{toName}</p>
                <p className="text-2xl font-bold text-primary mt-3">{display(enteredAmount)}</p>
                {note && <p className="text-xs text-muted-foreground mt-2 italic">"{note}"</p>}

                {showQr && (
                  <div className="mt-6 flex justify-center animate-fade-in">
                    <div className="bg-white p-3 rounded-xl">
                      <QRCodeSVG value={deepLink} size={180} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <a
                  href={deepLink}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                >
                  <Zap className="h-4 w-4" /> Pay Now
                </a>
                <button
                  onClick={() => setShowQr((v) => !v)}
                  className="w-full flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-2.5 rounded-lg text-xs font-medium transition-all hover:bg-secondary/80"
                >
                  <QrCode className="h-3.5 w-3.5" /> {showQr ? "Hide QR Code" : "View QR Code"}
                </button>
              </div>

              <div className="flex gap-2.5 items-start p-3 rounded-lg border border-border/60 bg-secondary/30">
                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Payments are processed only through your UPI app. FinTrack doesn't handle or store the transfer — it
                  just updates your group balance once you confirm below.
                </p>
              </div>

              <Button onClick={handleSubmit} variant="outline" className="w-full gap-1.5 border-success text-success">
                <CheckCircle2 className="h-4 w-4" /> I've Paid — Mark as Settled
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
