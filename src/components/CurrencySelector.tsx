import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, CurrencyCode } from "@/lib/formatCurrency";

interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
}

export function CurrencySelector({ value, onChange }: CurrencySelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as CurrencyCode)}>
      <SelectTrigger className="w-[220px] bg-secondary border-border">
        <SelectValue placeholder="Currency" />
      </SelectTrigger>
      <SelectContent className="bg-card border-border max-h-60">
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.symbol} {c.code} — {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
