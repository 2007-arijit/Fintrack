import { getCategoryByValue } from "./categoryConfig";

export interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  category: string;
  custom_category?: string | null;
  description?: string | null;
  date: string;
  payment_method?: string | null;
}

export function exportTransactionsToCSV(transactions: TransactionRow[], filename = "transactions.csv") {
  const headers = ["Date", "Type", "Category", "Description", "Amount", "Payment Method"];
  const rows = transactions.map((t) => {
    const cat = getCategoryByValue(t.category);
    const categoryLabel = t.custom_category || cat?.label || t.category;
    return [t.date, t.type, categoryLabel, t.description || "", t.amount.toString(), t.payment_method || ""]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.match(/(\".*?\"|[^\",\s]+)(?=\s*,|\s*$)/g) || [];
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || "").replace(/^"|"$/g, "").replace(/""/g, '"');
    });
    return row;
  });
}
