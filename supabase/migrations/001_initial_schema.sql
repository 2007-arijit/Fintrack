-- ============================================================
-- FinTrack — Full Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ─── user_preferences ───────────────────────────────────────
CREATE TABLE public.user_preferences (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name         TEXT,
  currency             TEXT        NOT NULL DEFAULT 'INR',
  monthly_budget_default NUMERIC   DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own preferences"   ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create preferences on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── transactions ────────────────────────────────────────────
CREATE TABLE public.transactions (
  id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  amount           NUMERIC     NOT NULL CHECK (amount > 0),
  category         TEXT        NOT NULL,
  custom_category  TEXT,
  description      TEXT,
  date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  payment_method   TEXT        DEFAULT 'cash',
  source           TEXT,
  debt_id          UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions"   ON public.transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transactions" ON public.transactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transactions" ON public.transactions FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_transactions_user_date ON public.transactions (user_id, date DESC);
CREATE INDEX idx_transactions_user_type ON public.transactions (user_id, type);

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ─── budgets ─────────────────────────────────────────────────
CREATE TABLE public.budgets (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category   TEXT        NOT NULL,
  amount     NUMERIC     NOT NULL CHECK (amount > 0),
  month      INTEGER     NOT NULL CHECK (month >= 1 AND month <= 12),
  year       INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, month, year)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own budgets"   ON public.budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own budgets" ON public.budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own budgets" ON public.budgets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own budgets" ON public.budgets FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_budgets_user_month ON public.budgets (user_id, month, year);

-- ─── debts ───────────────────────────────────────────────────
CREATE TABLE public.debts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL CHECK (type IN ('receivable', 'payable')),
  person_name      TEXT        NOT NULL,
  original_amount  NUMERIC     NOT NULL CHECK (original_amount > 0),
  remaining_amount NUMERIC     NOT NULL,
  description      TEXT,
  debt_date        DATE        NOT NULL,
  due_date         DATE,
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own debts"   ON public.debts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own debts" ON public.debts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own debts" ON public.debts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own debts" ON public.debts FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.debts;

-- ─── debt_settlements ────────────────────────────────────────
CREATE TABLE public.debt_settlements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id        UUID        NOT NULL REFERENCES public.debts(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_settled NUMERIC     NOT NULL CHECK (amount_settled > 0),
  settled_at     DATE        NOT NULL,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.debt_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settlements"   ON public.debt_settlements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settlements" ON public.debt_settlements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own settlements" ON public.debt_settlements FOR DELETE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.debt_settlements;

-- ─── monthly_balances ────────────────────────────────────────
CREATE TABLE public.monthly_balances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month           TEXT        NOT NULL,
  closing_balance NUMERIC     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE public.monthly_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own balances"   ON public.monthly_balances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own balances" ON public.monthly_balances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own balances" ON public.monthly_balances FOR UPDATE USING (auth.uid() = user_id);

-- ─── FK on transactions.debt_id ──────────────────────────────
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_debt_id_fkey
  FOREIGN KEY (debt_id) REFERENCES public.debts(id) ON DELETE SET NULL;
