import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCategoriesByType } from "@/lib/categoryConfig";

interface CategoryDropdownProps {
  type: "income" | "expense";
  value: string;
  onChange: (value: string) => void;
}

export function CategoryDropdown({ type, value, onChange }: CategoryDropdownProps) {
  const categories = getCategoriesByType(type);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="bg-secondary border-border">
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {categories.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.emoji} {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
