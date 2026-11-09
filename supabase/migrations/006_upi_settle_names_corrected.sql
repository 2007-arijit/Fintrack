-- ============================================================
-- FinTrack — UPI Settle Up + real member names fix (corrected)
-- Run after migrations 001–005.
--
-- Access rule:
-- A signed-in group member can retrieve UPI details ONLY for linked
-- recipients assigned to that caller by FinTrack's simplified
-- settle-up calculation (positive creditor transfer).
-- ============================================================

-- ─── upi_id on user_preferences ──────────────────────────────
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS upi_id TEXT;

-- Make the constraint safe if this migration is retried.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.user_preferences'::regclass
      AND conname = 'user_preferences_upi_id_format'
  ) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_upi_id_format
      CHECK (
        upi_id IS NULL
        OR upi_id ~ '^[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9]*$'
      );
  END IF;
END
$$;

-- ─── fix hard-coded "You" member names ───────────────────────
UPDATE public.group_members gm
SET name = COALESCE(
  NULLIF(up.display_name, ''),
  split_part(au.email, '@', 1)
)
FROM public.user_preferences up
JOIN auth.users au ON au.id = up.user_id
WHERE gm.member_user_id = up.user_id
  AND gm.name = 'You'
  AND COALESCE(
    NULLIF(up.display_name, ''),
    split_part(au.email, '@', 1)
  ) IS NOT NULL;

-- ─── get_group_payment_info: only suggested recipients ───────
-- Reproduces src/lib/splitEngine.ts:
--   net = paid - share + settledOut - settledIn
-- Debtors and creditors are sorted by amount descending, then member
-- ID ascending. Cumulative interval overlap reproduces the same greedy
-- minimum-transfer matching used by the frontend.
--
-- This definition also remains compatible with later migrations:
-- to_jsonb(...)->>'deleted_at' and ->>'visibility' safely handle columns
-- that are added by later migrations. Participant-only expenses are
-- included only when the caller is in that expense's audience.

CREATE OR REPLACE FUNCTION public.get_group_payment_info(_group_id UUID)
RETURNS TABLE (
  member_user_id UUID,
  display_name TEXT,
  upi_id TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH my_member AS (
    SELECT gm.id AS member_id
    FROM public.group_members gm
    WHERE gm.group_id = _group_id
      AND gm.member_user_id = auth.uid()
  ),
  visible_expenses AS (
    SELECT e.*
    FROM public.group_expenses e
    CROSS JOIN my_member me
    WHERE e.group_id = _group_id
      AND to_jsonb(e)->>'deleted_at' IS NULL
      AND (
        COALESCE(to_jsonb(e)->>'visibility', 'group') = 'group'
        OR e.paid_by = me.member_id
        OR e.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_expense_splits s
          WHERE s.expense_id = e.id
            AND s.member_id = me.member_id
        )
      )
  ),
  paid AS (
    SELECT e.paid_by AS member_id, SUM(e.amount) AS amount
    FROM visible_expenses e
    GROUP BY e.paid_by
  ),
  shares AS (
    SELECT s.member_id, SUM(s.share_amount) AS amount
    FROM public.group_expense_splits s
    JOIN visible_expenses e ON e.id = s.expense_id
    GROUP BY s.member_id
  ),
  settled_out AS (
    SELECT t.from_member_id AS member_id, SUM(t.amount) AS amount
    FROM public.group_settlements t
    WHERE t.group_id = _group_id
      AND to_jsonb(t)->>'deleted_at' IS NULL
    GROUP BY t.from_member_id
  ),
  settled_in AS (
    SELECT t.to_member_id AS member_id, SUM(t.amount) AS amount
    FROM public.group_settlements t
    WHERE t.group_id = _group_id
      AND to_jsonb(t)->>'deleted_at' IS NULL
    GROUP BY t.to_member_id
  ),
  member_nets AS (
    SELECT
      gm.id AS member_id,
      COALESCE(p.amount, 0)
        - COALESCE(sh.amount, 0)
        + COALESCE(so.amount, 0)
        - COALESCE(si.amount, 0) AS net_amount
    FROM public.group_members gm
    LEFT JOIN paid p ON p.member_id = gm.id
    LEFT JOIN shares sh ON sh.member_id = gm.id
    LEFT JOIN settled_out so ON so.member_id = gm.id
    LEFT JOIN settled_in si ON si.member_id = gm.id
    WHERE gm.group_id = _group_id
  ),
  debtor_ranges AS (
    SELECT
      member_id,
      -net_amount AS amount,
      SUM(-net_amount) OVER (
        ORDER BY -net_amount DESC, member_id::text ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS range_end
    FROM member_nets
    WHERE net_amount < 0
  ),
  debtor_intervals AS (
    SELECT member_id, amount, range_end - amount AS range_start, range_end
    FROM debtor_ranges
  ),
  creditor_ranges AS (
    SELECT
      member_id,
      net_amount AS amount,
      SUM(net_amount) OVER (
        ORDER BY net_amount DESC, member_id::text ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS range_end
    FROM member_nets
    WHERE net_amount > 0
  ),
  creditor_intervals AS (
    SELECT member_id, amount, range_end - amount AS range_start, range_end
    FROM creditor_ranges
  ),
  caller_transfers AS (
    SELECT
      ci.member_id AS recipient_member_id,
      LEAST(di.range_end, ci.range_end)
        - GREATEST(di.range_start, ci.range_start) AS transfer_amount
    FROM debtor_intervals di
    JOIN creditor_intervals ci
      ON LEAST(di.range_end, ci.range_end)
         > GREATEST(di.range_start, ci.range_start)
    CROSS JOIN my_member me
    WHERE di.member_id = me.member_id
  )
  SELECT
    recipient.member_user_id,
    up.display_name,
    up.upi_id
  FROM caller_transfers ct
  JOIN public.group_members recipient
    ON recipient.id = ct.recipient_member_id
  JOIN public.user_preferences up
    ON up.user_id = recipient.member_user_id
  WHERE auth.uid() IS NOT NULL
    AND public.is_group_member(_group_id)
    AND ct.transfer_amount > 0
    AND recipient.member_user_id IS NOT NULL
    AND recipient.member_user_id <> auth.uid();
$$;

REVOKE ALL
  ON FUNCTION public.get_group_payment_info(UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE
  ON FUNCTION public.get_group_payment_info(UUID)
  TO authenticated;
