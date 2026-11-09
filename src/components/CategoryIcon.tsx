import {
  Banknote, Building2, Car, Clapperboard, Coins, CreditCard, FileText, Gift, GraduationCap, Handshake, HeartPulse,
  Home, KeyRound, Landmark, Laptop, Lightbulb, MoreHorizontal, Plane, Receipt, Repeat, ShieldCheck, ShoppingBag,
  ShoppingCart, Smartphone, Sparkles, TrendingUp, Undo2, Utensils, Wallet, type LucideIcon,
} from "lucide-react";
import { getCategoryByValue } from "@/lib/categoryConfig";
import { cn } from "@/lib/utils";

// Lucide replacements for the emoji in categoryConfig. Keyed by category value.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  food: Utensils, transport: Car, housing: Home, utilities: Lightbulb, entertainment: Clapperboard,
  shopping: ShoppingBag, health: HeartPulse, education: GraduationCap, travel: Plane, groceries: ShoppingCart,
  subscriptions: Repeat, insurance: ShieldCheck, gifts: Gift, personal: Sparkles,
  debt_payment: Handshake, debt_money_lent: Handshake, debt_payment_paid_back: Handshake,
  group_settlement_paid: Receipt, other_expense: MoreHorizontal,
  salary: Banknote, freelance: Laptop, investment: TrendingUp, business: Building2, rental: KeyRound,
  dividends: Coins, refund: Undo2, debt_recovery: Handshake, debt_money_borrowed: Handshake,
  debt_recovery_received: Handshake, group_settlement_received: Receipt, other_income: MoreHorizontal,
};

const PAYMENT_ICONS: Record<string, LucideIcon> = {
  cash: Banknote, card: CreditCard, upi: Smartphone, bank_transfer: Landmark, wallet: Wallet, cheque: FileText,
};

export function categoryIcon(value: string): LucideIcon {
  return CATEGORY_ICONS[value] ?? MoreHorizontal;
}
export function paymentIcon(value: string): LucideIcon {
  return PAYMENT_ICONS[value] ?? Wallet;
}

/** Rounded icon tile for a category. Decorative: the category name is always shown beside it. */
export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = categoryIcon(category);
  const income = getCategoryByValue(category)?.type === "income";
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        income ? "bg-success/10 text-success" : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

/** Inline icon + text label, for menus and table cells. */
export function CategoryLabel({ category, label }: { category: string; label: string }) {
  const Icon = categoryIcon(category);
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {label}
    </span>
  );
}

export function PaymentLabel({ method, label }: { method: string; label: string }) {
  const Icon = paymentIcon(method);
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {label}
    </span>
  );
}
