import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Coffee, Heart, Check, Copy, ExternalLink, Sparkles, Zap, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useToast } from "@/hooks/use-toast";

interface BuyChaiModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_AMOUNTS = [
  { amount: 30, label: "Cutting Chai", icon: "☕" },
  { amount: 50, label: "Masala Chai", icon: "🫖" },
  { amount: 100, label: "Chai & Samosa", icon: "🥐" },
  { amount: 250, label: "Special Brew", icon: "✨" },
];

export function BuyChaiModal({ open, onOpenChange }: BuyChaiModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(true);
  const { toast } = useToast();

  const upiId = "arijitkayal118@okhdfcbank";
  const creatorName = "Arijit Kayal";
  const finalAmount = customAmount ? Math.max(1, Number(customAmount) || selectedAmount) : selectedAmount;

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    creatorName
  )}&am=${finalAmount}&cu=INR&tn=${encodeURIComponent("Support FinTrack Dev - Arijit Kayal")}`;

  const handleCopyUpi = () => {
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    toast({
      title: "UPI ID Copied!",
      description: `${upiId} copied to clipboard. You can paste it in any UPI app.`,
    });
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenUpiApp = () => {
    // Attempt deep link navigation
    window.location.href = upiDeepLink;
    toast({
      title: `Initiating ₹${finalAmount} Payment`,
      description: "Opening UPI app... On desktop, simply scan the QR code above with Google Pay, PhonePe, or Paytm!",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border-border/80 bg-card/95 p-6 backdrop-blur-xl sm:rounded-2xl">
        <DialogHeader className="text-center sm:text-left">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-lg shadow-amber-500/10 sm:mx-0">
            <Coffee className="h-7 w-7 animate-bounce text-amber-400" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2 justify-center sm:justify-start">
            Buy Arijit Kayal a Chai
            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
              <Sparkles className="h-3 w-3" /> Creator
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            FinTrack is handcrafted and engineered by <strong>{creatorName}</strong>. If you love the platform,
            financial insights, or PayShield threat protection, treat Arijit to a hot cup of chai to fuel future innovations!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Preset Buttons */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Select Chai Size
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRESET_AMOUNTS.map((preset) => {
                const isSelected = selectedAmount === preset.amount && !customAmount;
                return (
                  <button
                    key={preset.amount}
                    type="button"
                    onClick={() => {
                      setSelectedAmount(preset.amount);
                      setCustomAmount("");
                    }}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                      isSelected
                        ? "border-amber-500 bg-amber-500/15 text-foreground shadow-sm shadow-amber-500/10 scale-[1.02]"
                        : "border-border/70 bg-secondary/30 text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <span className="text-base">{preset.icon}</span>
                    <span className="text-xs font-bold text-foreground">₹{preset.amount}</span>
                    <span className="text-[10px] text-muted-foreground line-clamp-1">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Amount */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Or Enter Custom Amount (₹)</span>
              {customAmount && <span className="text-amber-400 font-medium">Custom: ₹{customAmount}</span>}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                ₹
              </span>
              <Input
                type="number"
                min="1"
                placeholder="Enter custom amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="pl-7 bg-background/50 border-border/80 focus-visible:ring-amber-500/30"
              />
            </div>
          </div>

          {/* Live Dynamic UPI QR Code */}
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-secondary/30 to-secondary/10 p-4 text-center space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <QrCode className="h-4 w-4" />
                <span>Instant Scan & Pay</span>
              </div>
              <span className="font-mono text-xs font-bold text-foreground bg-secondary/80 px-2 py-0.5 rounded-md">
                ₹{finalAmount}
              </span>
            </div>

            <div className="flex justify-center py-1">
              <div className="rounded-xl bg-white p-3 shadow-md inline-block">
                <QRCodeSVG value={upiDeepLink} size={156} level="M" />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-snug">
              Scan with <strong>Google Pay</strong>, <strong>PhonePe</strong>, <strong>Paytm</strong>, or any UPI app.
            </p>
          </div>

          {/* Pay via UPI App Action */}
          <div className="space-y-2 pt-1">
            <Button
              type="button"
              onClick={handleOpenUpiApp}
              className="w-full gap-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold hover:from-amber-600 hover:to-amber-700 shadow-md shadow-amber-500/20"
              size="lg"
            >
              <Zap className="h-4 w-4" />
              Pay ₹{finalAmount} via UPI App
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopyUpi}
                className="flex-1 gap-2 text-xs border-border/80 bg-background/40 hover:bg-secondary"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "UPI ID Copied!" : "Copy UPI ID"}
              </Button>

              <a
                href="https://buymeachai.in/arijitkayal"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 text-xs border-border/80 bg-background/40 hover:bg-secondary text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  buymeachai.in
                </Button>
              </a>
            </div>
          </div>

          {/* Creator Attribution Footnote */}
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border/50 bg-secondary/20 p-2.5 text-center text-[11px] text-muted-foreground">
            <Heart className="h-3.5 w-3.5 fill-amber-500/20 text-amber-500 shrink-0" />
            <span>
              Directly supports <strong>{creatorName}</strong> to keep FinTrack independent and open.
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
