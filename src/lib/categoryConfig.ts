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

// Theme-aware: each entry resolves through a CSS variable defined in index.css,
// so charts follow light/dark. Consumers index with `i % CHART_COLORS.length`.
export const CHART_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `hsl(var(--chart-${n}))`);
