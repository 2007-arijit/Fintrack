# FinTrack — Personal Finance Tracker

A full-featured personal finance application to track income, expenses, budgets, and debts — built with React, TypeScript, and Supabase.

---

## Features

- **Dashboard** — Monthly balance, income/expense summaries, carry-forward from previous months, charts
- **Transactions** — Add, edit, delete, filter, search, sort, paginate; bulk delete; CSV import & export
- **Budgets** — Set monthly budgets per category with visual progress and over-budget alerts
- **Reports** — Monthly breakdown by category, yearly bar chart overview, net savings calculation
- **Debt Tracker** — Track money lent (receivable) and borrowed (payable), partial settlements, live calculation preview
- **Groups (Shared Expenses)** — Splitwise-style bill splitting: create groups (trips, roommates, friends), add members, log shared expenses with equal/unequal/percentage/shares splits, see per-member balances, and settle up with simplified "who owes whom" suggestions
- **Settings** — Display name, password change, currency selector (32 currencies), data export, data reset
- **Auth** — Email/password sign-up, sign-in, forgot password, password reset flow
- **Real-time** — Live updates via Supabase Realtime subscriptions
- **Responsive** — Full mobile support with bottom nav and floating add button; desktop sidebar

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | TanStack Query (React Query v5) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Routing | React Router v6 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime |
| Build | Vite + SWC |
| Deploy | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Clone & Install

```bash
git clone https://github.com/2007-arijit/Fintrack.git
cd fintrack
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run every file in `supabase/migrations/` in numeric order, one at a time:
   ```
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_shared_expenses_groups.sql
   ...
   supabase/migrations/012_payshield_scan_history.sql
   ```
   Migrations 009 and 010 change how split rows are stored — see `docs/SETUP_V2.md` for what each one does. If some migrations are already applied, check the database state instead of re-running them blindly.
3. Enable **Email Auth** in Authentication → Providers
4. Set your site URL in Authentication → URL Configuration

### 3. Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Find these in your Supabase project under **Settings → API**.

### 4. Run Locally

```bash
npm run dev
```

App runs at `http://localhost:5173`

---

## Deployment (Vercel)

### One-click deploy

1. Push this repository to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Add environment variables in the Vercel dashboard:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

4. Deploy — Vercel auto-detects Vite and builds correctly.

### Vercel SPA Routing

Create a `vercel.json` in the root if you need explicit SPA routing (usually not required with Vite):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project REST API URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous public key |

---

## Project Structure

```
fintrack/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── charts/          # Recharts wrappers
│   │   ├── layout/          # AppLayout, AppSidebar, MobileBottomNav, FloatingAddButton
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── TransactionModal.tsx
│   │   ├── SmartImportModal.tsx
│   │   ├── BudgetCard.tsx
│   │   ├── StatCard.tsx
│   │   └── ...
│   ├── contexts/
│   │   ├── AuthContext.tsx   # Supabase auth state
│   │   └── CurrencyContext.tsx
│   ├── hooks/
│   │   ├── useTransactions.ts
│   │   ├── useDebts.ts
│   │   ├── useBudgets.ts
│   │   ├── useMonthlyBalance.ts
│   │   └── useUserPreferences.ts
│   ├── integrations/
│   │   └── supabase/        # Client + generated types
│   ├── lib/
│   │   ├── categoryConfig.ts
│   │   ├── csvExport.ts
│   │   ├── formatCurrency.ts
│   │   └── utils.ts
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Transactions.tsx
│   │   ├── Budgets.tsx
│   │   ├── Reports.tsx
│   │   ├── Debt.tsx
│   │   ├── Settings.tsx
│   │   └── ResetPassword.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .gitignore
├── package.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## Author

Crafted & maintained by **[Arijit Kayal](https://github.com/2007-arijit)**.

---

## License

MIT License © 2026 Arijit Kayal

