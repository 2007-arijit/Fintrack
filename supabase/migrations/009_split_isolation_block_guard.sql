-- ============================================================
-- FinTrack 009 — Split isolation (Split never touches personal transactions)
--
-- 1. Split expenses/settlements no longer live in `transactions`.
--    Existing mirrored rows are COPIED to an archive table, then removed from
--    `transactions`, and a CHECK constraint forbids new ones. Personal
--    transactions (anything not created by the Split mirror) are untouched.
-- Run after 001–008.
-- ============================================================

-- ─── 1. take Split rows out of personal transactions ─────────
CREATE TABLE IF NOT EXISTS public.split_mirrored_transactions_archive (
  LIKE public.transactions INCLUDING ALL
);
ALTER TABLE public.split_mirrored_transactions_archive
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.split_mirrored_transactions_archive ENABLE ROW LEVEL SECURITY; -- no policies: unreadable via API
REVOKE ALL ON public.split_mirrored_transactions_archive FROM anon, authenticated;

INSERT INTO public.split_mirrored_transactions_archive
SELECT t.*, now()
FROM public.transactions t
WHERE t.group_expense_id IS NOT NULL
   OR t.group_settlement_id IS NOT NULL
   OR t.source IN ('group_expense_auto', 'group_settlement_auto')
ON CONFLICT DO NOTHING;

DELETE FROM public.transactions
WHERE group_expense_id IS NOT NULL
   OR group_settlement_id IS NOT NULL
   OR source IN ('group_expense_auto', 'group_settlement_auto');

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_not_split_chk;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_not_split_chk CHECK (
  group_expense_id IS NULL AND group_settlement_id IS NULL
  AND COALESCE(source, '') NOT IN ('group_expense_auto', 'group_settlement_auto')
);

-- The old mirror helper becomes a deliberate no-op (callers in 008 keep working).
CREATE OR REPLACE FUNCTION public._sync_expense_mirror(_expense_id UUID)
RETURNS VOID LANGUAGE sql AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public._sync_expense_mirror(UUID) FROM PUBLIC, anon, authenticated;

-- Settlements: same signature as 008, but never writes to `transactions`.
CREATE OR REPLACE FUNCTION public.record_group_settlement(
  _group_id UUID, _from UUID, _to UUID, _amount NUMERIC, _settled_at DATE, _note TEXT, _record_tx BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE _uid UUID := auth.uid(); _id UUID; _cur TEXT; _fn TEXT; _tn TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_group_member(_group_id) THEN RAISE EXCEPTION 'You are not a member of this group' USING ERRCODE = '42501'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'Payer and receiver must differ'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'Amount must be greater than zero with at most 2 decimals'; END IF;
  SELECT name INTO _fn FROM public.group_members WHERE id = _from AND group_id = _group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payer is not in this group'; END IF;
  SELECT name INTO _tn FROM public.group_members WHERE id = _to AND group_id = _group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receiver is not in this group'; END IF;
  SELECT currency INTO _cur FROM public.groups WHERE id = _group_id;

  INSERT INTO public.group_settlements (group_id, user_id, from_member_id, to_member_id, amount, settled_at, note)
  VALUES (_group_id, _uid, _from, _to, _amount, COALESCE(_settled_at, CURRENT_DATE), NULLIF(btrim(COALESCE(_note, '')), ''))
  RETURNING id INTO _id;

  PERFORM public._bump_group_version(_group_id);
  PERFORM public._audit_group_event(_group_id, 'settlement_created', 'settlement', _id,
    format('%s recorded settlement: %s paid %s %s', public.group_actor_name(_group_id), _fn, _tn, public.fmt_money(_amount, _cur)),
    NULL, jsonb_build_object('from', _from, 'to', _to, 'amount', _amount, 'settled_at', COALESCE(_settled_at, CURRENT_DATE), 'note', _note));
  RETURN jsonb_build_object('id', _id);
END $$;
GRANT EXECUTE ON FUNCTION public.record_group_settlement(UUID, UUID, UUID, NUMERIC, DATE, TEXT, BOOLEAN) TO authenticated;
