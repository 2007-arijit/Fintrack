-- ============================================================
-- FinTrack 008 — Split engine overhaul, Solo/Family participants,
-- division modes, soft-delete, Group Audit, atomic mutation RPCs
-- and a consistent single-snapshot ledger read.
--
-- Additive + backward compatible: every existing expense/split/
-- settlement keeps its amounts. Legacy rows are backfilled, never
-- recomputed. Run after 001–007.
-- ============================================================

-- ─── 1. participants: Solo / Family ──────────────────────────
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS participation_mode TEXT    NOT NULL DEFAULT 'solo'
    CHECK (participation_mode IN ('solo', 'family')),
  ADD COLUMN IF NOT EXISTS member_count       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS member_names       TEXT[];

ALTER TABLE public.group_members
  DROP CONSTRAINT IF EXISTS group_members_mode_count_chk;
ALTER TABLE public.group_members
  ADD CONSTRAINT group_members_mode_count_chk CHECK (
    (participation_mode = 'solo'   AND member_count = 1) OR
    (participation_mode = 'family' AND member_count >= 2)
  );

-- ─── 2. expenses: division mode, versioning, soft delete ─────
ALTER TABLE public.group_expenses
  ADD COLUMN IF NOT EXISTS division_mode       TEXT,
  ADD COLUMN IF NOT EXISTS custom_basis        TEXT,
  ADD COLUMN IF NOT EXISTS version             INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by          UUID,
  ADD COLUMN IF NOT EXISTS allocation_snapshot JSONB;

-- Legacy mapping: "equal" was an equal split per account => per_family
-- (identical to per_person while every member is solo); everything else
-- was a custom split (unequal=amount, percentage, shares=weight).
UPDATE public.group_expenses SET
  division_mode = CASE split_type WHEN 'equal' THEN 'per_family' ELSE 'custom' END,
  custom_basis  = CASE split_type WHEN 'unequal' THEN 'amount'
                                  WHEN 'percentage' THEN 'percentage'
                                  WHEN 'shares' THEN 'weight' ELSE NULL END
WHERE division_mode IS NULL;

ALTER TABLE public.group_expenses ALTER COLUMN division_mode SET NOT NULL;
ALTER TABLE public.group_expenses ALTER COLUMN division_mode SET DEFAULT 'per_family';
ALTER TABLE public.group_expenses
  DROP CONSTRAINT IF EXISTS group_expenses_division_mode_chk,
  ADD CONSTRAINT group_expenses_division_mode_chk
    CHECK (division_mode IN ('per_person', 'per_family', 'custom', 'selected', 'personal')),
  DROP CONSTRAINT IF EXISTS group_expenses_custom_basis_chk,
  ADD CONSTRAINT group_expenses_custom_basis_chk
    CHECK (custom_basis IS NULL OR custom_basis IN ('amount', 'percentage', 'weight'));

-- split_type stays for old readers; widen it so new modes can be mirrored.
ALTER TABLE public.group_expenses DROP CONSTRAINT IF EXISTS group_expenses_split_type_check;
ALTER TABLE public.group_expenses
  ADD CONSTRAINT group_expenses_split_type_check
  CHECK (split_type IN ('equal', 'unequal', 'percentage', 'shares', 'per_person', 'per_family', 'custom', 'selected', 'personal'));

-- Money is NUMERIC already; forbid sub-minor-unit garbage on NEW rows only.
ALTER TABLE public.group_expenses
  DROP CONSTRAINT IF EXISTS group_expenses_amount_scale_chk,
  ADD CONSTRAINT group_expenses_amount_scale_chk CHECK (amount = round(amount, 2)) NOT VALID;

-- ─── 3. splits: calculation basis snapshot ───────────────────
ALTER TABLE public.group_expense_splits
  ADD COLUMN IF NOT EXISTS mode_at_time         TEXT,
  ADD COLUMN IF NOT EXISTS member_count_at_time INTEGER,
  ADD COLUMN IF NOT EXISTS weight               NUMERIC;

UPDATE public.group_expense_splits SET
  mode_at_time = 'solo', member_count_at_time = 1, weight = share_units
WHERE mode_at_time IS NULL;

-- Backfill an allocation snapshot for legacy expenses from their own splits.
UPDATE public.group_expenses e SET allocation_snapshot = jsonb_build_object(
  'version', 1,
  'division_mode', e.division_mode,
  'custom_basis', e.custom_basis,
  'amount', e.amount,
  'allocations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'member_id', s.member_id, 'share_amount', s.share_amount, 'weight', s.weight,
      'member_count', s.member_count_at_time, 'mode', s.mode_at_time) ORDER BY s.member_id)
    FROM public.group_expense_splits s WHERE s.expense_id = e.id), '[]'::jsonb))
WHERE e.allocation_snapshot IS NULL;

-- ─── 4. settlements: soft delete ─────────────────────────────
ALTER TABLE public.group_settlements
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ─── 5. group financial version (monotonic, bumped per mutation) ──
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS financial_version BIGINT NOT NULL DEFAULT 0;

-- ─── 6. never cascade-destroy financial history when a member is removed ──
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.group_members'::regclass
      AND c.conrelid IN ('public.group_expenses'::regclass, 'public.group_expense_splits'::regclass, 'public.group_settlements'::regclass)
      AND pg_get_constraintdef(c.oid) LIKE '%ON DELETE CASCADE%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, replace(r.def, ' ON DELETE CASCADE', ''));
  END LOOP;
END $$;

-- ─── 7. audit table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.group_audit_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  actor_id          UUID,                       -- no FK: history survives account deletion
  actor_name        TEXT,
  action            TEXT        NOT NULL,
  entity_type       TEXT        NOT NULL,
  entity_id         UUID,
  description       TEXT        NOT NULL,
  previous_values   JSONB,
  new_values        JSONB,
  allocation_before JSONB,
  allocation_after  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()   -- server-generated
);
CREATE INDEX IF NOT EXISTS idx_group_audit_group_time ON public.group_audit_events (group_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_group_audit_group_action ON public.group_audit_events (group_id, action);
CREATE INDEX IF NOT EXISTS idx_group_audit_group_actor ON public.group_audit_events (group_id, actor_id);
CREATE INDEX IF NOT EXISTS idx_group_audit_entity ON public.group_audit_events (entity_id);

ALTER TABLE public.group_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can view audit" ON public.group_audit_events;
CREATE POLICY "Members can view audit" ON public.group_audit_events
  FOR SELECT USING (public.is_group_member(group_id));
-- No INSERT/UPDATE/DELETE policy and no privilege: events are append-only and
-- can only be written by the SECURITY DEFINER functions below.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.group_audit_events FROM anon, authenticated;
GRANT SELECT ON public.group_audit_events TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_audit_events;

-- ─── 8. lock direct writes to financial tables: RPCs only ────
DROP POLICY IF EXISTS "Members can add group expenses"     ON public.group_expenses;
DROP POLICY IF EXISTS "Owner or admin can edit expense"    ON public.group_expenses;
DROP POLICY IF EXISTS "Owner or admin can delete expense"  ON public.group_expenses;
DROP POLICY IF EXISTS "Members can add splits"             ON public.group_expense_splits;
DROP POLICY IF EXISTS "Members can update splits"          ON public.group_expense_splits;
DROP POLICY IF EXISTS "Members can delete splits"          ON public.group_expense_splits;
DROP POLICY IF EXISTS "Members can add settlements"        ON public.group_settlements;
DROP POLICY IF EXISTS "Owner or admin can delete settlement" ON public.group_settlements;
REVOKE INSERT, UPDATE, DELETE ON public.group_expenses, public.group_expense_splits, public.group_settlements FROM anon, authenticated;
-- groups.financial_version must not be client-writable.
REVOKE UPDATE ON public.groups FROM anon, authenticated;
GRANT UPDATE (name, group_type, currency, archived) ON public.groups TO authenticated;

-- ─── 9. helpers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fmt_money(_amount NUMERIC, _currency TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE _currency WHEN 'INR' THEN '₹' WHEN 'USD' THEN '$' WHEN 'EUR' THEN '€' WHEN 'GBP' THEN '£'
                         ELSE _currency || ' ' END)
         || trim(to_char(_amount, 'FM999,999,999,990.00'));
$$;

CREATE OR REPLACE FUNCTION public.group_actor_name(_group_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT gm.name FROM public.group_members gm WHERE gm.group_id = _group_id AND gm.member_user_id = auth.uid() LIMIT 1),
    (SELECT COALESCE(NULLIF(up.display_name, ''), up.username) FROM public.user_preferences up WHERE up.user_id = auth.uid()),
    'Someone');
$$;

CREATE OR REPLACE FUNCTION public._audit_group_event(
  _group_id UUID, _action TEXT, _entity_type TEXT, _entity_id UUID, _description TEXT,
  _previous JSONB DEFAULT NULL, _new JSONB DEFAULT NULL, _alloc_before JSONB DEFAULT NULL, _alloc_after JSONB DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.group_audit_events
    (group_id, actor_id, actor_name, action, entity_type, entity_id, description,
     previous_values, new_values, allocation_before, allocation_after)
  VALUES (_group_id, auth.uid(), public.group_actor_name(_group_id), _action, _entity_type, _entity_id,
          _description, _previous, _new, _alloc_before, _alloc_after);
$$;
REVOKE ALL ON FUNCTION public._audit_group_event(UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._bump_group_version(_group_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.groups SET financial_version = financial_version + 1 WHERE id = _group_id;
$$;
REVOKE ALL ON FUNCTION public._bump_group_version(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._expense_allocation_json(_expense_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'member_id', s.member_id, 'member_name', m.name, 'share_amount', s.share_amount,
      'weight', s.weight, 'member_count', s.member_count_at_time, 'mode', s.mode_at_time)
    ORDER BY m.created_at, s.member_id), '[]'::jsonb)
  FROM public.group_expense_splits s JOIN public.group_members m ON m.id = s.member_id
  WHERE s.expense_id = _expense_id;
$$;
REVOKE ALL ON FUNCTION public._expense_allocation_json(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._expense_json(_e public.group_expenses)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('description', _e.description, 'amount', _e.amount, 'category', _e.category,
    'paid_by', _e.paid_by, 'division_mode', _e.division_mode, 'custom_basis', _e.custom_basis,
    'expense_date', _e.expense_date, 'notes', _e.notes, 'version', _e.version);
$$;
REVOKE ALL ON FUNCTION public._expense_json(public.group_expenses) FROM PUBLIC, anon, authenticated;

-- Mirrors ONLY the creator's own share into personal transactions (existing behaviour).
CREATE OR REPLACE FUNCTION public._sync_expense_mirror(_expense_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.group_expenses%ROWTYPE; _share NUMERIC;
BEGIN
  DELETE FROM public.transactions WHERE group_expense_id = _expense_id;
  SELECT * INTO e FROM public.group_expenses WHERE id = _expense_id;
  IF NOT FOUND OR e.deleted_at IS NOT NULL THEN RETURN; END IF;
  SELECT s.share_amount INTO _share
  FROM public.group_expense_splits s JOIN public.group_members m ON m.id = s.member_id
  WHERE s.expense_id = _expense_id AND m.member_user_id = e.user_id;
  IF COALESCE(_share, 0) > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, category, description, date, payment_method, source, group_expense_id)
    VALUES (e.user_id, 'expense', _share, e.category, e.description || ' (your share)', e.expense_date, 'cash', 'group_expense_auto', e.id);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._sync_expense_mirror(UUID) FROM PUBLIC, anon, authenticated;

-- ─── 10. save (create / edit) expense — atomic, validated, audited ──
CREATE OR REPLACE FUNCTION public.save_group_expense(
  _expense_id UUID, _group_id UUID, _description TEXT, _amount NUMERIC, _category TEXT,
  _paid_by UUID, _division_mode TEXT, _custom_basis TEXT, _expense_date DATE, _notes TEXT,
  _allocations JSONB, _expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _cur public.group_expenses%ROWTYPE;
  _new public.group_expenses%ROWTYPE;
  _currency TEXT; _minor NUMERIC; _id UUID;
  _a JSONB; _m public.group_members%ROWTYPE;
  _sum NUMERIC := 0; _wsum NUMERIC := 0; _cnt INTEGER := 0; _w NUMERIC;
  _before JSONB; _after JSONB; _prev JSONB; _actor TEXT; _changes TEXT[] := '{}';
  _keep BOOLEAN := (_allocations IS NULL);
  _is_edit BOOLEAN := (_expense_id IS NOT NULL);
  _weights JSONB := '{}'::jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_group_member(_group_id) THEN RAISE EXCEPTION 'You are not a member of this group' USING ERRCODE = '42501'; END IF;
  SELECT currency INTO _currency FROM public.groups WHERE id = _group_id;
  _minor := CASE WHEN _currency IN ('JPY', 'KRW', 'CLP', 'HUF') THEN 1 ELSE 0.01 END;

  _description := btrim(COALESCE(_description, ''));
  IF _description = '' THEN RAISE EXCEPTION 'Description is required'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'Amount must be greater than zero with at most 2 decimals'; END IF;
  IF _division_mode NOT IN ('per_person', 'per_family', 'custom', 'selected', 'personal') THEN RAISE EXCEPTION 'Unknown division mode'; END IF;
  IF _division_mode = 'custom' AND COALESCE(_custom_basis, '') NOT IN ('amount', 'percentage', 'weight') THEN RAISE EXCEPTION 'Custom split needs a basis'; END IF;
  IF _division_mode <> 'custom' THEN _custom_basis := NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE id = _paid_by AND group_id = _group_id) THEN RAISE EXCEPTION 'Payer is not in this group'; END IF;

  IF _is_edit THEN
    SELECT * INTO _cur FROM public.group_expenses WHERE id = _expense_id AND group_id = _group_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
    IF _cur.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This expense was deleted'; END IF;
    IF NOT (_cur.user_id = _uid OR public.is_group_admin(_group_id)) THEN RAISE EXCEPTION 'Only the creator or group admin can edit this expense' USING ERRCODE = '42501'; END IF;
    IF _expected_version IS DISTINCT FROM _cur.version THEN
      RAISE EXCEPTION 'CONFLICT: this expense was changed by someone else. Reload and try again.' USING ERRCODE = '40001';
    END IF;
    IF _keep AND (_cur.amount <> _amount OR _cur.division_mode <> _division_mode OR _cur.custom_basis IS DISTINCT FROM _custom_basis) THEN
      RAISE EXCEPTION 'Allocations are required when the amount or division mode changes';
    END IF;
  ELSIF _keep THEN
    RAISE EXCEPTION 'Allocations are required';
  END IF;

  IF NOT _keep THEN
    IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN RAISE EXCEPTION 'Select at least one participant'; END IF;
    FOR _a IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
      SELECT * INTO _m FROM public.group_members WHERE id = (_a->>'member_id')::uuid AND group_id = _group_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Allocation references a participant outside this group'; END IF;
      IF (_a->>'share_amount')::numeric < 0 THEN RAISE EXCEPTION 'Allocations cannot be negative'; END IF;
      IF (_a->>'share_amount')::numeric <> round((_a->>'share_amount')::numeric, 2) THEN RAISE EXCEPTION 'Allocations must have at most 2 decimals'; END IF;
      IF _weights ? (_a->>'member_id') THEN RAISE EXCEPTION 'Duplicate participant in allocation'; END IF;
      -- Reject allocations computed from an out-of-date participant configuration.
      IF (_a->>'member_count')::int <> _m.member_count OR (_a->>'mode') <> _m.participation_mode THEN
        RAISE EXCEPTION 'STALE_PARTICIPANTS: participant details changed. Reload and re-check the split.' USING ERRCODE = '40001';
      END IF;
      _w := CASE _division_mode
              WHEN 'per_person' THEN (CASE WHEN _m.participation_mode = 'solo' THEN 1 ELSE _m.member_count END)
              WHEN 'custom'     THEN COALESCE((_a->>'weight')::numeric, 0)
              ELSE 1 END;
      IF _w < 0 THEN RAISE EXCEPTION 'Weights cannot be negative'; END IF;
      _weights := _weights || jsonb_build_object(_a->>'member_id', _w);
      _sum := _sum + (_a->>'share_amount')::numeric;
      _wsum := _wsum + _w;
      _cnt := _cnt + 1;
    END LOOP;
    IF _sum <> _amount THEN RAISE EXCEPTION 'Allocations (%) must add up to the amount (%)', _sum, _amount; END IF;
    IF _division_mode = 'personal' AND _cnt <> 1 THEN RAISE EXCEPTION 'A personal expense has exactly one responsible participant'; END IF;
    IF _division_mode = 'custom' AND _custom_basis = 'percentage' AND _wsum <> 100 THEN RAISE EXCEPTION 'Percentages must add up to 100'; END IF;
    IF _division_mode <> 'personal' AND NOT (_division_mode = 'custom' AND _custom_basis = 'amount') THEN
      IF _wsum <= 0 THEN RAISE EXCEPTION 'Total weight must be greater than zero'; END IF;
      FOR _a IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
        IF abs((_a->>'share_amount')::numeric - _amount * (_weights->>(_a->>'member_id'))::numeric / _wsum) > _minor THEN
          RAISE EXCEPTION 'Allocation does not match the % division', _division_mode;
        END IF;
      END LOOP;
    END IF;
  END IF;

  _actor := public.group_actor_name(_group_id);

  IF NOT _is_edit THEN
    INSERT INTO public.group_expenses (group_id, user_id, description, amount, category, paid_by, split_type,
                                       division_mode, custom_basis, expense_date, notes)
    VALUES (_group_id, _uid, _description, _amount, COALESCE(NULLIF(_category, ''), 'other_expense'), _paid_by,
            _division_mode, _division_mode, _custom_basis, _expense_date, NULLIF(btrim(COALESCE(_notes, '')), ''))
    RETURNING * INTO _new;
    _id := _new.id;
  ELSE
    _id := _expense_id;
    _before := public._expense_allocation_json(_id);
    _prev := public._expense_json(_cur);
    UPDATE public.group_expenses SET description = _description, amount = _amount,
      category = COALESCE(NULLIF(_category, ''), 'other_expense'), paid_by = _paid_by,
      split_type = _division_mode, division_mode = _division_mode, custom_basis = _custom_basis,
      expense_date = _expense_date, notes = NULLIF(btrim(COALESCE(_notes, '')), ''), version = version + 1
    WHERE id = _id RETURNING * INTO _new;
  END IF;

  IF NOT _keep THEN
    DELETE FROM public.group_expense_splits WHERE expense_id = _id;
    INSERT INTO public.group_expense_splits (expense_id, member_id, user_id, share_amount, share_units, mode_at_time, member_count_at_time, weight)
    SELECT _id, (a->>'member_id')::uuid, _uid, (a->>'share_amount')::numeric,
           CASE WHEN _division_mode = 'custom' AND _custom_basis IN ('percentage', 'weight') THEN (a->>'weight')::numeric END,
           a->>'mode', (a->>'member_count')::int, (_weights->>(a->>'member_id'))::numeric
    FROM jsonb_array_elements(_allocations) a;
  END IF;

  _after := public._expense_allocation_json(_id);
  UPDATE public.group_expenses SET allocation_snapshot = jsonb_build_object(
    'version', 1, 'division_mode', _division_mode, 'custom_basis', _custom_basis, 'amount', _amount, 'allocations', _after)
  WHERE id = _id;

  PERFORM public._sync_expense_mirror(_id);
  PERFORM public._bump_group_version(_group_id);

  IF NOT _is_edit THEN
    PERFORM public._audit_group_event(_group_id, 'expense_created', 'expense', _id,
      format('%s added %s — %s', _actor, _description, public.fmt_money(_amount, _currency)),
      NULL, public._expense_json(_new), NULL, _after);
  ELSE
    IF _cur.description <> _new.description THEN _changes := _changes || format('title “%s” → “%s”', _cur.description, _new.description); END IF;
    IF _cur.amount <> _new.amount THEN _changes := _changes || format('amount %s → %s', public.fmt_money(_cur.amount, _currency), public.fmt_money(_new.amount, _currency)); END IF;
    IF _cur.category <> _new.category THEN _changes := _changes || format('category %s → %s', _cur.category, _new.category); END IF;
    IF _cur.expense_date <> _new.expense_date THEN _changes := _changes || format('date %s → %s', _cur.expense_date, _new.expense_date); END IF;
    IF _cur.notes IS DISTINCT FROM _new.notes THEN _changes := _changes || 'notes'; END IF;
    IF _cur.paid_by <> _new.paid_by THEN
      _changes := _changes || format('payer %s → %s',
        (SELECT name FROM public.group_members WHERE id = _cur.paid_by), (SELECT name FROM public.group_members WHERE id = _new.paid_by));
    END IF;
    IF _before IS DISTINCT FROM _after THEN _changes := _changes || 'allocations'; END IF;
    IF array_length(_changes, 1) IS NULL THEN _changes := ARRAY['no field changes']; END IF;
    PERFORM public._audit_group_event(_group_id, 'expense_updated', 'expense', _id,
      format('%s edited %s: %s', _actor, _new.description, array_to_string(_changes, '; ')),
      _prev, public._expense_json(_new), _before, _after);
    IF _cur.division_mode <> _new.division_mode THEN
      PERFORM public._audit_group_event(_group_id, 'division_mode_changed', 'expense', _id,
        format('%s changed division mode of %s from %s to %s', _actor, _new.description,
               initcap(replace(_cur.division_mode, '_', ' ')), initcap(replace(_new.division_mode, '_', ' '))),
        jsonb_build_object('division_mode', _cur.division_mode), jsonb_build_object('division_mode', _new.division_mode), _before, _after);
    END IF;
    IF _cur.paid_by <> _new.paid_by THEN
      PERFORM public._audit_group_event(_group_id, 'payer_changed', 'expense', _id,
        format('%s changed the payer of %s', _actor, _new.description),
        jsonb_build_object('paid_by', _cur.paid_by), jsonb_build_object('paid_by', _new.paid_by));
    END IF;
  END IF;

  RETURN jsonb_build_object('id', _id, 'version', _new.version);
END $$;
GRANT EXECUTE ON FUNCTION public.save_group_expense(UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, DATE, TEXT, JSONB, INTEGER) TO authenticated;

-- ─── 11. soft delete / restore expense ───────────────────────
CREATE OR REPLACE FUNCTION public.delete_group_expense(_expense_id UUID, _expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _e public.group_expenses%ROWTYPE; _cur TEXT; _alloc JSONB;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO _e FROM public.group_expenses WHERE id = _expense_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_e.group_id) THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF _e.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This expense was already deleted'; END IF;
  IF NOT (_e.user_id = _uid OR public.is_group_admin(_e.group_id)) THEN RAISE EXCEPTION 'Only the creator or group admin can delete this expense' USING ERRCODE = '42501'; END IF;
  IF _expected_version IS DISTINCT FROM _e.version THEN
    RAISE EXCEPTION 'CONFLICT: this expense was changed by someone else. Reload and try again.' USING ERRCODE = '40001';
  END IF;
  SELECT currency INTO _cur FROM public.groups WHERE id = _e.group_id;
  _alloc := public._expense_allocation_json(_e.id);
  UPDATE public.group_expenses SET deleted_at = now(), deleted_by = _uid, version = version + 1 WHERE id = _e.id;
  PERFORM public._sync_expense_mirror(_e.id);
  PERFORM public._bump_group_version(_e.group_id);
  PERFORM public._audit_group_event(_e.group_id, 'expense_deleted', 'expense', _e.id,
    format('%s deleted %s — %s', public.group_actor_name(_e.group_id), _e.description, public.fmt_money(_e.amount, _cur)),
    public._expense_json(_e), NULL, _alloc, NULL);
  RETURN jsonb_build_object('id', _e.id);
END $$;
GRANT EXECUTE ON FUNCTION public.delete_group_expense(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_group_expense(_expense_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _e public.group_expenses%ROWTYPE; _cur TEXT; _alloc JSONB;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO _e FROM public.group_expenses WHERE id = _expense_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_e.group_id) THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF _e.deleted_at IS NULL THEN RAISE EXCEPTION 'This expense is not deleted'; END IF;
  IF NOT (_e.user_id = _uid OR public.is_group_admin(_e.group_id)) THEN RAISE EXCEPTION 'Only the creator or group admin can restore this expense' USING ERRCODE = '42501'; END IF;
  SELECT currency INTO _cur FROM public.groups WHERE id = _e.group_id;
  UPDATE public.group_expenses SET deleted_at = NULL, deleted_by = NULL, version = version + 1 WHERE id = _e.id;
  _alloc := public._expense_allocation_json(_e.id);
  PERFORM public._sync_expense_mirror(_e.id);
  PERFORM public._bump_group_version(_e.group_id);
  PERFORM public._audit_group_event(_e.group_id, 'expense_restored', 'expense', _e.id,
    format('%s restored %s — %s', public.group_actor_name(_e.group_id), _e.description, public.fmt_money(_e.amount, _cur)),
    NULL, public._expense_json(_e), NULL, _alloc);
  RETURN jsonb_build_object('id', _e.id);
END $$;
GRANT EXECUTE ON FUNCTION public.restore_group_expense(UUID) TO authenticated;

-- ─── 12. settlements ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_group_settlement(
  _group_id UUID, _from UUID, _to UUID, _amount NUMERIC, _settled_at DATE, _note TEXT, _record_tx BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _id UUID; _cur TEXT; _me UUID; _fn TEXT; _tn TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
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

  IF _record_tx THEN
    SELECT id INTO _me FROM public.group_members WHERE group_id = _group_id AND member_user_id = _uid;
    IF _me = _from THEN
      INSERT INTO public.transactions (user_id, type, amount, category, description, date, payment_method, source, group_settlement_id)
      VALUES (_uid, 'expense', _amount, 'group_settlement_paid', 'Settled up with ' || _tn || COALESCE(' — ' || NULLIF(btrim(_note), ''), ''), COALESCE(_settled_at, CURRENT_DATE), 'cash', 'group_settlement_auto', _id);
    ELSIF _me = _to THEN
      INSERT INTO public.transactions (user_id, type, amount, category, description, date, payment_method, source, group_settlement_id)
      VALUES (_uid, 'income', _amount, 'group_settlement_received', 'Settled up with ' || _fn || COALESCE(' — ' || NULLIF(btrim(_note), ''), ''), COALESCE(_settled_at, CURRENT_DATE), 'cash', 'group_settlement_auto', _id);
    END IF;
  END IF;

  PERFORM public._bump_group_version(_group_id);
  PERFORM public._audit_group_event(_group_id, 'settlement_created', 'settlement', _id,
    format('%s recorded settlement: %s paid %s %s', public.group_actor_name(_group_id), _fn, _tn, public.fmt_money(_amount, _cur)),
    NULL, jsonb_build_object('from', _from, 'to', _to, 'amount', _amount, 'settled_at', COALESCE(_settled_at, CURRENT_DATE), 'note', _note));
  RETURN jsonb_build_object('id', _id);
END $$;
GRANT EXECUTE ON FUNCTION public.record_group_settlement(UUID, UUID, UUID, NUMERIC, DATE, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_group_settlement(_settlement_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _s public.group_settlements%ROWTYPE; _cur TEXT; _fn TEXT; _tn TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO _s FROM public.group_settlements WHERE id = _settlement_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_s.group_id) THEN RAISE EXCEPTION 'Settlement not found'; END IF;
  IF _s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This settlement was already removed'; END IF;
  IF NOT (_s.user_id = _uid OR public.is_group_admin(_s.group_id)) THEN RAISE EXCEPTION 'Only the creator or group admin can remove this settlement' USING ERRCODE = '42501'; END IF;
  SELECT currency INTO _cur FROM public.groups WHERE id = _s.group_id;
  SELECT name INTO _fn FROM public.group_members WHERE id = _s.from_member_id;
  SELECT name INTO _tn FROM public.group_members WHERE id = _s.to_member_id;
  UPDATE public.group_settlements SET deleted_at = now(), deleted_by = _uid WHERE id = _s.id;
  DELETE FROM public.transactions WHERE group_settlement_id = _s.id;
  PERFORM public._bump_group_version(_s.group_id);
  PERFORM public._audit_group_event(_s.group_id, 'settlement_deleted', 'settlement', _s.id,
    format('%s removed settlement: %s → %s %s', public.group_actor_name(_s.group_id), _fn, _tn, public.fmt_money(_s.amount, _cur)),
    jsonb_build_object('from', _s.from_member_id, 'to', _s.to_member_id, 'amount', _s.amount, 'settled_at', _s.settled_at, 'note', _s.note), NULL);
  RETURN jsonb_build_object('id', _s.id);
END $$;
GRANT EXECUTE ON FUNCTION public.delete_group_settlement(UUID) TO authenticated;

-- ─── 13. participant management ──────────────────────────────
CREATE OR REPLACE FUNCTION public.update_group_participant(
  _member_id UUID, _name TEXT, _mode TEXT, _member_count INTEGER, _member_names TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.group_members%ROWTYPE; _names TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO _m FROM public.group_members WHERE id = _member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found'; END IF;
  IF NOT (public.is_group_admin(_m.group_id) OR _m.member_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the group admin or the participant can edit these details' USING ERRCODE = '42501';
  END IF;
  _name := btrim(COALESCE(_name, ''));
  IF _name = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  IF _mode NOT IN ('solo', 'family') THEN RAISE EXCEPTION 'Unknown participation mode'; END IF;
  IF _member_count IS NULL OR _member_count < 1 THEN RAISE EXCEPTION 'Member count must be at least 1'; END IF;
  IF _mode = 'solo' AND _member_count <> 1 THEN RAISE EXCEPTION 'A solo participant represents exactly one person'; END IF;
  IF _mode = 'family' AND _member_count < 2 THEN RAISE EXCEPTION 'A family represents at least two people'; END IF;
  SELECT COALESCE(array_agg(btrim(n)) FILTER (WHERE btrim(n) <> ''), '{}') INTO _names FROM unnest(COALESCE(_member_names, '{}')) n;
  IF array_length(_names, 1) > _member_count THEN RAISE EXCEPTION 'More member names than members'; END IF;
  -- Historical splits keep their own mode/count snapshot: nothing is recomputed here.
  UPDATE public.group_members SET name = _name, participation_mode = _mode, member_count = _member_count,
         member_names = CASE WHEN array_length(_names, 1) IS NULL THEN NULL ELSE _names END
  WHERE id = _member_id;
  PERFORM public._bump_group_version(_m.group_id);
END $$;
GRANT EXECUTE ON FUNCTION public.update_group_participant(UUID, TEXT, TEXT, INTEGER, TEXT[]) TO authenticated;

-- join via invite now records the participant's chosen mode.
DROP FUNCTION IF EXISTS public.join_group_via_invite(TEXT);
CREATE OR REPLACE FUNCTION public.join_group_via_invite(
  _code TEXT, _mode TEXT DEFAULT 'solo', _member_count INTEGER DEFAULT 1, _member_names TEXT[] DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _invite public.group_invites%ROWTYPE; _name TEXT; _existing UUID; _count INTEGER; _names TEXT[];
  _colors TEXT[] := ARRAY['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#a855f7','#ef4444','#84cc16'];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _invite FROM public.group_invites WHERE code = _code AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invite link is invalid or has been revoked'; END IF;
  SELECT id INTO _existing FROM public.group_members WHERE group_id = _invite.group_id AND member_user_id = auth.uid();
  IF FOUND THEN RETURN _invite.group_id; END IF;
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = _invite.group_id AND user_id = auth.uid()) THEN RETURN _invite.group_id; END IF;

  IF _mode NOT IN ('solo', 'family') THEN RAISE EXCEPTION 'Choose Solo or Family mode'; END IF;
  IF _mode = 'solo' THEN _member_count := 1; END IF;
  IF _mode = 'family' AND (_member_count IS NULL OR _member_count < 2) THEN RAISE EXCEPTION 'A family represents at least two people'; END IF;
  SELECT COALESCE(array_agg(btrim(n)) FILTER (WHERE btrim(n) <> ''), '{}') INTO _names FROM unnest(COALESCE(_member_names, '{}')) n;
  IF array_length(_names, 1) > _member_count THEN RAISE EXCEPTION 'More member names than members'; END IF;

  SELECT COALESCE(username, display_name, split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1))
    INTO _name FROM public.user_preferences WHERE user_id = auth.uid();
  SELECT COUNT(*) INTO _count FROM public.group_members WHERE group_id = _invite.group_id;

  INSERT INTO public.group_members (group_id, user_id, member_user_id, name, is_you, color, participation_mode, member_count, member_names)
  VALUES (_invite.group_id, _invite.created_by, auth.uid(), COALESCE(_name, 'Member'), false, _colors[(_count % 8) + 1],
          _mode, _member_count, CASE WHEN array_length(_names, 1) IS NULL THEN NULL ELSE _names END);
  PERFORM public._bump_group_version(_invite.group_id);
  RETURN _invite.group_id;
END $$;
GRANT EXECUTE ON FUNCTION public.join_group_via_invite(TEXT, TEXT, INTEGER, TEXT[]) TO authenticated;

-- ─── 14. audit triggers for membership / group settings / invites ──
-- (Direct writes by an admin are allowed by RLS, so these must live in the DB.)
CREATE OR REPLACE FUNCTION public.trg_audit_group_members() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _label TEXT; _actor TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- group (or account) is being deleted: cascade, nothing to audit against.
    IF NOT EXISTS (SELECT 1 FROM public.groups WHERE id = OLD.group_id) THEN RETURN OLD; END IF;
    PERFORM public._audit_group_event(OLD.group_id, 'member_removed', 'member', OLD.id,
      format('%s removed %s from the group', public.group_actor_name(OLD.group_id), OLD.name),
      jsonb_build_object('name', OLD.name, 'mode', OLD.participation_mode, 'member_count', OLD.member_count), NULL);
    RETURN OLD;
  END IF;
  _actor := public.group_actor_name(NEW.group_id);
  IF TG_OP = 'INSERT' THEN
    _label := CASE NEW.participation_mode WHEN 'family' THEN 'Family Mode, ' || NEW.member_count || ' people' ELSE 'Solo Mode' END;
    PERFORM public._audit_group_event(NEW.group_id,
      CASE WHEN NEW.member_user_id = auth.uid() THEN 'member_joined' ELSE 'member_added' END, 'member', NEW.id,
      CASE WHEN NEW.member_user_id = auth.uid() THEN format('%s joined the group (%s)', NEW.name, _label)
           ELSE format('%s added %s to the group (%s)', _actor, NEW.name, _label) END,
      NULL, jsonb_build_object('name', NEW.name, 'mode', NEW.participation_mode, 'member_count', NEW.member_count));
    RETURN NEW;
  END IF;
  -- UPDATE
  IF OLD.participation_mode <> NEW.participation_mode THEN
    PERFORM public._audit_group_event(NEW.group_id, 'participant_mode_changed', 'member', NEW.id,
      format('%s changed %s from %s to %s Mode', _actor, NEW.name, initcap(OLD.participation_mode), initcap(NEW.participation_mode)),
      jsonb_build_object('mode', OLD.participation_mode, 'member_count', OLD.member_count),
      jsonb_build_object('mode', NEW.participation_mode, 'member_count', NEW.member_count));
  ELSIF OLD.member_count <> NEW.member_count THEN
    PERFORM public._audit_group_event(NEW.group_id, 'member_count_changed', 'member', NEW.id,
      format('%s changed %s''s member count: %s → %s', _actor, NEW.name, OLD.member_count, NEW.member_count),
      jsonb_build_object('member_count', OLD.member_count), jsonb_build_object('member_count', NEW.member_count));
  END IF;
  IF OLD.name <> NEW.name THEN
    PERFORM public._audit_group_event(NEW.group_id, 'participant_renamed', 'member', NEW.id,
      format('%s renamed %s to %s', _actor, OLD.name, NEW.name),
      jsonb_build_object('name', OLD.name), jsonb_build_object('name', NEW.name));
  END IF;
  IF OLD.member_names IS DISTINCT FROM NEW.member_names THEN
    PERFORM public._audit_group_event(NEW.group_id, 'participant_members_updated', 'member', NEW.id,
      format('%s updated the member names of %s', _actor, NEW.name),
      jsonb_build_object('member_names', OLD.member_names), jsonb_build_object('member_names', NEW.member_names));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_group_members ON public.group_members;
CREATE TRIGGER audit_group_members AFTER INSERT OR UPDATE OR DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_group_members();

CREATE OR REPLACE FUNCTION public.trg_audit_groups() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor TEXT := public.group_actor_name(NEW.id);
BEGIN
  IF OLD.name <> NEW.name OR OLD.group_type <> NEW.group_type OR OLD.currency <> NEW.currency OR OLD.archived <> NEW.archived THEN
    PERFORM public._audit_group_event(NEW.id, 'group_settings_changed', 'group', NEW.id,
      format('%s changed group settings%s%s%s%s', _actor,
        CASE WHEN OLD.name <> NEW.name THEN format(' — name “%s” → “%s”', OLD.name, NEW.name) ELSE '' END,
        CASE WHEN OLD.group_type <> NEW.group_type THEN format(' — type %s → %s', OLD.group_type, NEW.group_type) ELSE '' END,
        CASE WHEN OLD.currency <> NEW.currency THEN format(' — currency %s → %s', OLD.currency, NEW.currency) ELSE '' END,
        CASE WHEN OLD.archived <> NEW.archived THEN CASE WHEN NEW.archived THEN ' — archived' ELSE ' — unarchived' END ELSE '' END),
      jsonb_build_object('name', OLD.name, 'group_type', OLD.group_type, 'currency', OLD.currency, 'archived', OLD.archived),
      jsonb_build_object('name', NEW.name, 'group_type', NEW.group_type, 'currency', NEW.currency, 'archived', NEW.archived));
  END IF;
  IF OLD.user_id <> NEW.user_id THEN
    PERFORM public._audit_group_event(NEW.id, 'admin_changed', 'group', NEW.id, format('%s changed the group admin', _actor),
      jsonb_build_object('admin', OLD.user_id), jsonb_build_object('admin', NEW.user_id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_groups ON public.groups;
CREATE TRIGGER audit_groups AFTER UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.trg_audit_groups();

CREATE OR REPLACE FUNCTION public.trg_audit_group_invites() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._audit_group_event(NEW.group_id, 'invite_created', 'invite', NEW.id, format('%s created an invite link', public.group_actor_name(NEW.group_id)));
  ELSIF OLD.active AND NOT NEW.active THEN
    PERFORM public._audit_group_event(NEW.group_id, 'invite_revoked', 'invite', NEW.id, format('%s revoked an invite link', public.group_actor_name(NEW.group_id)));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_group_invites ON public.group_invites;
CREATE TRIGGER audit_group_invites AFTER INSERT OR UPDATE ON public.group_invites FOR EACH ROW EXECUTE FUNCTION public.trg_audit_group_invites();

-- ─── 15. consistent single-snapshot ledger read ──────────────
-- One SQL statement => one MVCC snapshot, so expenses, splits and
-- settlements are always from the same committed generation, stamped with
-- groups.financial_version. Returns NULL when the caller is not a member.
CREATE OR REPLACE FUNCTION public.get_group_ledger(_group_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'group_id', g.id,
    'currency', g.currency,
    'version', g.financial_version,
    'expenses', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.expense_date DESC, e.created_at DESC)
                          FROM public.group_expenses e WHERE e.group_id = g.id AND e.deleted_at IS NULL), '[]'::jsonb),
    'splits', COALESCE((SELECT jsonb_agg(to_jsonb(s))
                        FROM public.group_expense_splits s JOIN public.group_expenses e ON e.id = s.expense_id
                        WHERE e.group_id = g.id AND e.deleted_at IS NULL), '[]'::jsonb),
    'settlements', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.settled_at DESC, t.created_at DESC)
                             FROM public.group_settlements t WHERE t.group_id = g.id AND t.deleted_at IS NULL), '[]'::jsonb)
  )
  FROM public.groups g
  WHERE g.id = _group_id AND public.is_group_member(g.id);
$$;
GRANT EXECUTE ON FUNCTION public.get_group_ledger(UUID) TO authenticated;
