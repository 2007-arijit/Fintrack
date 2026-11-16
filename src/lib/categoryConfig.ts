export interface Category {
  value: string;
  label: string;
  emoji: string;
  type: "income" | "expense";
}

export const EXPENSE_CATEGORIES: Category[] = [
  { value: "food", label: "Food & Dining", emoji: "🍕", type: "expense" },
  { value: "transport", label: "Transport", emoji: "🚗", type: "expense" },
  { value: "housing", label: "Housing & Rent", emoji: "🏠", type: "expense" },
  { value: "utilities", label: "Utilities", emoji: "💡", type: "expense" },
  { value: "entertainment", label: "Entertainment", emoji: "🎬", type: "expense" },
  { value: "shopping", label: "Shopping", emoji: "🛍️", type: "expense" },
  { value: "health", label: "Health & Medical", emoji: "🏥", type: "expense" },
  { value: "education", label: "Education", emoji: "📚", type: "expense" },
  { value: "travel", label: "Travel", emoji: "✈️", type: "expense" },
  { value: "groceries", label: "Groceries", emoji: "🛒", type: "expense" },
  { value: "subscriptions", label: "Subscriptions", emoji: "📱", type: "expense" },
  { value: "insurance", label: "Insurance", emoji: "🛡️", type: "expense" },
  { value: "gifts", label: "Gifts", emoji: "🎁", type: "expense" },
  { value: "personal", label: "Personal Care", emoji: "💅", type: "expense" },
  { value: "debt_payment", label: "Debt Payment", emoji: "🤝", type: "expense" },
  { value: "debt_money_lent", label: "Debt — Money Lent", emoji: "🤝", type: "expense" },
  { value: "debt_payment_paid_back", label: "Debt Payment — Paid Back", emoji: "🤝", type: "expense" },
  { value: "group_settlement_paid", label: "Group Settlement — Paid", emoji: "🧾", type: "expense" },
  { value: "other_expense", label: "Other", emoji: "📝", type: "expense" },
];

export const INCOME_CATEGORIES: Category[] = [
  { value: "salary", label: "Salary", emoji: "💰", type: "income" },
  { value: "freelance", label: "Freelance", emoji: "💻", type: "income" },
  { value: "investment", label: "Investment", emoji: "📈", type: "income" },
  { value: "business", label: "Business", emoji: "🏢", type: "income" },
  { value: "rental", label: "Rental Income", emoji: "🏘️", type: "income" },
  { value: "dividends", label: "Dividends", emoji: "💵", type: "income" },
  { value: "refund", label: "Refund", emoji: "🔄", type: "income" },
  { value: "debt_recovery", label: "Debt Recovery", emoji: "🤝", type: "income" },
  { value: "debt_money_borrowed", label: "Debt — Money Borrowed", emoji: "🤝", type: "income" },
  { value: "debt_recovery_received", label: "Debt Recovery — Received", emoji: "🤝", type: "income" },
  { value: "group_settlement_received", label: "Group Settlement — Received", emoji: "🧾", type: "income" },
  { value: "other_income", label: "Other", emoji: "📝", type: "income" },
];

export const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export function getCategoryByValue(value: string): Category | undefined {
  return ALL_CATEGORIES.find((c) => c.value === value);
}

export function getCategoriesByType(type: "income" | "expense"): Category[] {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export const DEBT_AUTO_CATEGORIES = [
  "debt_money_lent",
  "debt_money_borrowed",
  "debt_recovery_received",
  "debt_payment_paid_back",
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash", emoji: "💵" },
  { value: "card", label: "Card", emoji: "💳" },
  { value: "upi", label: "UPI", emoji: "📱" },
  { value: "bank_transfer", label: "Bank Transfer", emoji: "🏦" },
  { value: "wallet", label: "Digital Wallet", emoji: "👛" },
  { value: "cheque", label: "Cheque", emoji: "📄" },
];

export const CHART_COLORS = [
  "hsl(35, 92%, 58%)",  // amber
  "hsl(175, 70%, 45%)", // teal
  "hsl(152, 60%, 48%)", // warm green
  "hsl(0, 72%, 60%)",   // warm red
  "hsl(280, 45%, 68%)", // soft violet
  "hsl(38, 92%, 56%)",  // gold
  "hsl(200, 60%, 55%)", // sky
  "hsl(320, 50%, 62%)", // rose
  "hsl(160, 55%, 45%)", // jade
  "hsl(30, 80%, 55%)",  // orange
  "hsl(255, 35%, 65%)", // slate violet
  "hsl(95, 50%, 50%)",  // olive
  "hsl(215, 55%, 60%)", // steel
  "hsl(350, 65%, 62%)", // coral
  "hsl(45, 85%, 58%)",  // wheat
];
