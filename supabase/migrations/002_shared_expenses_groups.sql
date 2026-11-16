-- ============================================================
-- FinTrack — Shared Expenses / Groups (Splitwise-style)
-- Run this in your Supabase SQL Editor after 001_initial_schema.sql
-- ============================================================

-- ─── groups ─────────────────────────────────────────────────
CREATE TABLE public.groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  group_type  TEXT        NOT NULL DEFAULT 'other' CHECK (group_type IN ('trip', 'home', 'couple', 'friends', 'other')),
  currency    TEXT        NOT NULL DEFAULT 'INR',
  archived    BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own groups"   ON public.groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own groups" ON public.groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own groups" ON public.groups FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;

-- ─── group_members ──────────────────────────────────────────
-- Members are lightweight (name-based, like debts.person_name) — no invite/auth
-- required, mirroring how the rest of the app tracks other people.
CREATE TABLE public.group_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  is_you     BOOLEAN     NOT NULL DEFAULT false,
  color      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own group members"   ON public.group_members FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own group members" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own group members" ON public.group_members FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own group members" ON public.group_members FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_group_members_group ON public.group_members (group_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;

-- ─── group_expenses ─────────────────────────────────────────
CREATE TABLE public.group_expenses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description  TEXT        NOT NULL,
  amount       NUMERIC     NOT NULL CHECK (amount > 0),
  category     TEXT        NOT NULL DEFAULT 'other_expense',
  paid_by      UUID        NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  split_type   TEXT        NOT NULL DEFAULT 'equal' CHECK (split_type IN ('equal', 'unequal', 'percentage', 'shares')),
  expense_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own group expenses"   ON public.group_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own group expenses" ON public.group_expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own group expenses" ON public.group_expenses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own group expenses" ON public.group_expenses FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_group_expenses_group_date ON public.group_expenses (group_id, expense_date DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_expenses;

-- ─── group_expense_splits ───────────────────────────────────
-- One row per member per expense: how much of that expense they're
-- responsible for. share_units carries the raw % or share-count that
-- produced share_amount, so the editor can be re-opened faithfully.
CREATE TABLE public.group_expense_splits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID        NOT NULL REFERENCES public.group_expenses(id) ON DELETE CASCADE,
  member_id    UUID        NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount NUMERIC     NOT NULL CHECK (share_amount >= 0),
  share_units  NUMERIC,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (expense_id, member_id)
);

ALTER TABLE public.group_expense_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own splits"   ON public.group_expense_splits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own splits" ON public.group_expense_splits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own splits" ON public.group_expense_splits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own splits" ON public.group_expense_splits FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_group_expense_splits_expense ON public.group_expense_splits (expense_id);
CREATE INDEX idx_group_expense_splits_member ON public.group_expense_splits (member_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_expense_splits;

-- ─── group_settlements ──────────────────────────────────────
-- Records a payment from one member to another that squares up part
-- (or all) of the balance between them. Kept out of `transactions` on
-- purpose — it just moves an existing IOU, it isn't new spending.
CREATE TABLE public.group_settlements (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_member_id UUID        NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  to_member_id   UUID        NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  amount         NUMERIC     NOT NULL CHECK (amount > 0),
  settled_at     DATE        NOT NULL DEFAULT CURRENT_DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.group_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own group settlements"   ON public.group_settlements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own group settlements" ON public.group_settlements FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own group settlements" ON public.group_settlements FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_group_settlements_group ON public.group_settlements (group_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_settlements;

-- ─── link group expenses/settlements to personal transactions ──
-- Only *your* share of a group expense is mirrored into `transactions`
-- (so Dashboard/Reports/Budgets reflect true personal spend, not the
-- full amount you may have fronted for everyone else). Settlements are
-- only mirrored if the user opts in (real cash actually moved).
ALTER TABLE public.transactions
  ADD COLUMN group_expense_id UUID REFERENCES public.group_expenses(id) ON DELETE SET NULL,
  ADD COLUMN group_settlement_id UUID REFERENCES public.group_settlements(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_group_expense ON public.transactions (group_expense_id);
CREATE INDEX idx_transactions_group_settlement ON public.transactions (group_settlement_id);
