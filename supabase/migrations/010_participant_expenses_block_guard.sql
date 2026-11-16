-- ============================================================
-- FinTrack 010 — participant-visible expenses + blocked-account hardening
-- Run after migrations 001-009, including the corrected 009.
--
-- This is a replacement for the user's supplied Migration 010.
-- It preserves the participant-visibility behavior and adds explicit
-- blocked-account checks to exposed SECURITY DEFINER functions.
-- ============================================================

ALTER TABLE public.group_expenses
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'group'
  CHECK (visibility IN ('group', 'participants'));

ALTER TABLE public.group_audit_events
  ADD COLUMN IF NOT EXISTS restricted_member_ids UUID[];

-- A table created by migration 008: add a restrictive suspension policy
-- because migration 007 could not add a policy to this not-yet-existing table.
ALTER TABLE public.group_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS block_access_while_suspended ON public.group_audit_events;
CREATE POLICY block_access_while_suspended
ON public.group_audit_events AS RESTRICTIVE
FOR ALL TO authenticated
USING (NOT public.is_user_blocked())
WITH CHECK (NOT public.is_user_blocked());

-- ─── helpers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._my_member_id(_group_id UUID)
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT id
  FROM public.group_members
  WHERE group_id = _group_id
    AND member_user_id = auth.uid()
    AND NOT public.is_user_blocked()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._my_member_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._my_member_id(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public._expense_audience(_expense_id UUID)
RETURNS UUID[]
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(array_agg(DISTINCT m), '{}')
  FROM (
    SELECT e.paid_by AS m FROM public.group_expenses e WHERE e.id = _expense_id
    UNION
    SELECT s.member_id FROM public.group_expense_splits s WHERE s.expense_id = _expense_id
    UNION
    SELECT gm.id
    FROM public.group_expenses e
    JOIN public.group_members gm
      ON gm.group_id = e.group_id AND gm.member_user_id = e.user_id
    WHERE e.id = _expense_id
  ) x
  WHERE m IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public._expense_audience(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_see_expense(_expense_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NOT public.is_user_blocked()
    AND EXISTS (
      SELECT 1
      FROM public.group_expenses e
      WHERE e.id = _expense_id
        AND public.is_group_member(e.group_id)
        AND (
          e.visibility = 'group'
          OR public._my_member_id(e.group_id) = ANY (public._expense_audience(e.id))
        )
    );
$$;
REVOKE ALL ON FUNCTION public.can_see_expense(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_expense(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public._hidden_expense_count(_group_id UUID)
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN public.is_user_blocked() THEN 0 ELSE count(*)::int END
  FROM public.group_expenses e
  WHERE e.group_id = _group_id
    AND e.deleted_at IS NULL
    AND e.visibility = 'participants'
    AND public.is_group_member(_group_id)
    AND NOT public.can_see_expense(e.id);
$$;
REVOKE ALL ON FUNCTION public._hidden_expense_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._hidden_expense_count(UUID) TO authenticated;

-- ─── RLS: non-participants cannot read the rows at all ───────
DROP POLICY IF EXISTS "Members can view group expenses" ON public.group_expenses;
CREATE POLICY "Members can view group expenses" ON public.group_expenses
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.can_see_expense(id));

DROP POLICY IF EXISTS "Members can view splits" ON public.group_expense_splits;
CREATE POLICY "Members can view splits" ON public.group_expense_splits
  FOR SELECT TO authenticated
  USING (
    public.can_see_expense(expense_id)
    AND EXISTS (
      SELECT 1 FROM public.group_expenses e
      WHERE e.id = expense_id AND e.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Members can view audit" ON public.group_audit_events;
CREATE POLICY "Members can view audit" ON public.group_audit_events
  FOR SELECT TO authenticated
  USING (
    public.is_group_member(group_id)
    AND (
      restricted_member_ids IS NULL
      OR public._my_member_id(group_id) = ANY (restricted_member_ids)
    )
  );

-- ─── audit writer gets an audience argument ──────────────────
DROP FUNCTION IF EXISTS public._audit_group_event(UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, JSONB);
CREATE OR REPLACE FUNCTION public._audit_group_event(
  _group_id UUID, _action TEXT, _entity_type TEXT, _entity_id UUID, _description TEXT,
  _previous JSONB DEFAULT NULL, _new JSONB DEFAULT NULL,
  _alloc_before JSONB DEFAULT NULL, _alloc_after JSONB DEFAULT NULL,
  _restricted UUID[] DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.is_user_blocked() THEN
    RAISE EXCEPTION 'Account is temporarily blocked' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.group_audit_events
    (group_id, actor_id, actor_name, action, entity_type, entity_id, description,
     previous_values, new_values, allocation_before, allocation_after, restricted_member_ids)
  VALUES (_group_id, auth.uid(), public.group_actor_name(_group_id), _action, _entity_type, _entity_id,
          _description, _previous, _new, _alloc_before, _alloc_after, _restricted);
END;
$$;
REVOKE ALL ON FUNCTION public._audit_group_event(UUID, TEXT, TEXT, UUID, TEXT, JSONB, JSONB, JSONB, JSONB, UUID[])
  FROM PUBLIC, anon, authenticated;

-- ─── retire the creator-only private-expense machinery ────────
DROP FUNCTION IF EXISTS public.share_private_expense(UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, DATE, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.make_group_expense_private(UUID, INTEGER, TEXT, NUMERIC, TEXT, DATE, TEXT);
DROP FUNCTION IF EXISTS public.make_group_expense_private(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.save_group_expense(UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, DATE, TEXT, JSONB, INTEGER);

DO $$
DECLARE r RECORD; mid UUID; eid UUID;
BEGIN
  IF to_regclass('public.group_private_expenses') IS NULL THEN RETURN; END IF;
  FOR r IN EXECUTE 'SELECT * FROM public.group_private_expenses' LOOP
    mid := NULL;
    SELECT id INTO mid
    FROM public.group_members
    WHERE group_id = r.group_id AND member_user_id = r.user_id
    LIMIT 1;

    IF mid IS NULL THEN
      SELECT id INTO mid
      FROM public.group_members
      WHERE group_id = r.group_id AND user_id = r.user_id AND is_you
      LIMIT 1;
    END IF;

    IF mid IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.group_expenses
      (group_id, user_id, description, amount, category, paid_by, split_type, division_mode,
       expense_date, notes, visibility)
    VALUES
      (r.group_id, r.user_id, r.description, r.amount, r.category, mid, 'personal', 'personal',
       r.expense_date, r.notes, 'participants')
    RETURNING id INTO eid;

    INSERT INTO public.group_expense_splits
      (expense_id, member_id, user_id, share_amount, mode_at_time, member_count_at_time, weight)
    SELECT eid, gm.id, r.user_id, r.amount, gm.participation_mode, gm.member_count, 1
    FROM public.group_members gm
    WHERE gm.id = mid;

    EXECUTE 'DELETE FROM public.group_private_expenses WHERE id = $1' USING r.id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.group_private_expenses) THEN
    DROP TABLE public.group_private_expenses;
  ELSE
    RAISE NOTICE 'group_private_expenses kept: % rows could not be migrated (creator not found in group)',
      (SELECT count(*) FROM public.group_private_expenses);
  END IF;
END $$;

-- ─── mutation RPCs with visibility ───────────────────────────
CREATE OR REPLACE FUNCTION public.save_group_expense(
  _expense_id UUID, _group_id UUID, _description TEXT, _amount NUMERIC, _category TEXT,
  _paid_by UUID, _division_mode TEXT, _custom_basis TEXT, _expense_date DATE, _notes TEXT,
  _allocations JSONB, _expected_version INTEGER, _visibility TEXT DEFAULT 'group'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
  _aud UUID[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_group_member(_group_id) THEN RAISE EXCEPTION 'You are not a member of this group' USING ERRCODE = '42501'; END IF;

  SELECT currency INTO _currency FROM public.groups WHERE id = _group_id;
  _minor := CASE WHEN _currency IN ('JPY', 'KRW', 'CLP', 'HUF') THEN 1 ELSE 0.01 END;

  _description := btrim(COALESCE(_description, ''));
  IF _description = '' THEN RAISE EXCEPTION 'Description is required'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount <> round(_amount, 2) THEN RAISE EXCEPTION 'Amount must be greater than zero with at most 2 decimals'; END IF;
  IF _visibility NOT IN ('group', 'participants') THEN RAISE EXCEPTION 'Unknown visibility'; END IF;
  IF _division_mode NOT IN ('per_person', 'per_family', 'custom', 'selected', 'personal') THEN RAISE EXCEPTION 'Unknown division mode'; END IF;
  IF _division_mode = 'custom' AND COALESCE(_custom_basis, '') NOT IN ('amount', 'percentage', 'weight') THEN RAISE EXCEPTION 'Custom split needs a basis'; END IF;
  IF _division_mode <> 'custom' THEN _custom_basis := NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.group_members WHERE id = _paid_by AND group_id = _group_id) THEN RAISE EXCEPTION 'Payer is not in this group'; END IF;

  IF _is_edit THEN
    SELECT * INTO _cur FROM public.group_expenses WHERE id = _expense_id AND group_id = _group_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
    IF _cur.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This expense was deleted'; END IF;
    IF NOT (_cur.user_id = _uid OR (public.is_group_admin(_group_id) AND public.can_see_expense(_expense_id))) THEN
      RAISE EXCEPTION 'Only the creator or group admin can edit this expense' USING ERRCODE = '42501';
    END IF;
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
    IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
      RAISE EXCEPTION 'Select at least one participant';
    END IF;

    FOR _a IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
      SELECT * INTO _m
      FROM public.group_members
      WHERE id = (_a->>'member_id')::uuid AND group_id = _group_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Allocation references a participant outside this group'; END IF;
      IF (_a->>'share_amount')::numeric < 0 THEN RAISE EXCEPTION 'Allocations cannot be negative'; END IF;
      IF (_a->>'share_amount')::numeric <> round((_a->>'share_amount')::numeric, 2) THEN
        RAISE EXCEPTION 'Allocations must have at most 2 decimals';
      END IF;
      IF _weights ? (_a->>'member_id') THEN RAISE EXCEPTION 'Duplicate participant in allocation'; END IF;
      IF (_a->>'member_count')::int <> _m.member_count OR (_a->>'mode') <> _m.participation_mode THEN
        RAISE EXCEPTION 'STALE_PARTICIPANTS: participant details changed. Reload and re-check the split.' USING ERRCODE = '40001';
      END IF;

      _w := CASE _division_mode
        WHEN 'per_person' THEN (CASE WHEN _m.participation_mode = 'solo' THEN 1 ELSE _m.member_count END)
        WHEN 'custom' THEN COALESCE((_a->>'weight')::numeric, 0)
        ELSE 1 END;
      IF _w < 0 THEN RAISE EXCEPTION 'Weights cannot be negative'; END IF;
      _weights := _weights || jsonb_build_object(_a->>'member_id', _w);
      _sum := _sum + (_a->>'share_amount')::numeric;
      _wsum := _wsum + _w;
      _cnt := _cnt + 1;
    END LOOP;

    IF _sum <> _amount THEN RAISE EXCEPTION 'Allocations (%) must add up to the amount (%)', _sum, _amount; END IF;
    IF _division_mode = 'personal' AND _cnt <> 1 THEN
      RAISE EXCEPTION 'A personal expense has exactly one responsible participant';
    END IF;
    IF _division_mode = 'custom' AND _custom_basis = 'percentage' AND _wsum <> 100 THEN
      RAISE EXCEPTION 'Percentages must add up to 100';
    END IF;
    IF _division_mode <> 'personal' AND NOT (_division_mode = 'custom' AND _custom_basis = 'amount') THEN
      IF _wsum <= 0 THEN RAISE EXCEPTION 'Total weight must be greater than zero'; END IF;
      FOR _a IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
        IF abs((_a->>'share_amount')::numeric -
          _amount * (_weights->>(_a->>'member_id'))::numeric / _wsum) > _minor THEN
          RAISE EXCEPTION 'Allocation does not match the % division', _division_mode;
        END IF;
      END LOOP;
    END IF;
  END IF;

  _actor := public.group_actor_name(_group_id);

  IF NOT _is_edit THEN
    INSERT INTO public.group_expenses
      (group_id, user_id, description, amount, category, paid_by, split_type,
       division_mode, custom_basis, expense_date, notes, visibility)
    VALUES
      (_group_id, _uid, _description, _amount, COALESCE(NULLIF(_category, ''), 'other_expense'),
       _paid_by, _division_mode, _division_mode, _custom_basis, _expense_date,
       NULLIF(btrim(COALESCE(_notes, '')), ''), _visibility)
    RETURNING * INTO _new;
    _id := _new.id;
  ELSE
    _id := _expense_id;
    _before := public._expense_allocation_json(_id);
    _prev := public._expense_json(_cur);
    UPDATE public.group_expenses
    SET description = _description, amount = _amount,
        category = COALESCE(NULLIF(_category, ''), 'other_expense'),
        paid_by = _paid_by, split_type = _division_mode, division_mode = _division_mode,
        custom_basis = _custom_basis, expense_date = _expense_date,
        notes = NULLIF(btrim(COALESCE(_notes, '')), ''),
        visibility = _visibility, version = version + 1
    WHERE id = _id
    RETURNING * INTO _new;
  END IF;

  IF NOT _keep THEN
    DELETE FROM public.group_expense_splits WHERE expense_id = _id;
    INSERT INTO public.group_expense_splits
      (expense_id, member_id, user_id, share_amount, share_units, mode_at_time, member_count_at_time, weight)
    SELECT _id, (a->>'member_id')::uuid, _uid, (a->>'share_amount')::numeric,
           CASE WHEN _division_mode = 'custom' AND _custom_basis IN ('percentage', 'weight')
                THEN (a->>'weight')::numeric END,
           a->>'mode', (a->>'member_count')::int, (_weights->>(a->>'member_id'))::numeric
    FROM jsonb_array_elements(_allocations) a;
  END IF;

  _after := public._expense_allocation_json(_id);
  UPDATE public.group_expenses
  SET allocation_snapshot = jsonb_build_object(
    'version', 1, 'division_mode', _division_mode, 'custom_basis', _custom_basis,
    'amount', _amount, 'allocations', _after
  )
  WHERE id = _id;

  PERFORM public._bump_group_version(_group_id);

  _aud := CASE WHEN _visibility = 'participants' THEN public._expense_audience(_id) END;
  IF _is_edit THEN
    UPDATE public.group_audit_events
    SET restricted_member_ids = CASE
      WHEN _visibility = 'group' THEN NULL
      WHEN restricted_member_ids IS NULL THEN _aud
      ELSE (SELECT array_agg(DISTINCT x) FROM unnest(restricted_member_ids || _aud) x)
    END
    WHERE entity_type = 'expense' AND entity_id = _id;
  END IF;

  IF NOT _is_edit THEN
    PERFORM public._audit_group_event(
      _group_id, 'expense_created', 'expense', _id,
      format('%s added %s — %s', _actor, _description, public.fmt_money(_amount, _currency)),
      NULL, public._expense_json(_new), NULL, _after, _aud
    );
  ELSE
    IF _cur.description <> _new.description THEN _changes := _changes || format('title “%s” → “%s”', _cur.description, _new.description); END IF;
    IF _cur.amount <> _new.amount THEN _changes := _changes || format('amount %s → %s', public.fmt_money(_cur.amount, _currency), public.fmt_money(_new.amount, _currency)); END IF;
    IF _cur.category <> _new.category THEN _changes := _changes || format('category %s → %s', _cur.category, _new.category); END IF;
    IF _cur.expense_date <> _new.expense_date THEN _changes := _changes || format('date %s → %s', _cur.expense_date, _new.expense_date); END IF;
    IF _cur.notes IS DISTINCT FROM _new.notes THEN _changes := _changes || 'notes'; END IF;
    IF _cur.paid_by <> _new.paid_by THEN
      _changes := _changes || format('payer %s → %s',
        (SELECT name FROM public.group_members WHERE id = _cur.paid_by),
        (SELECT name FROM public.group_members WHERE id = _new.paid_by));
    END IF;
    IF _before IS DISTINCT FROM _after THEN _changes := _changes || 'allocations'; END IF;
    IF array_length(_changes, 1) IS NULL THEN _changes := ARRAY['no field changes']; END IF;

    PERFORM public._audit_group_event(
      _group_id, 'expense_updated', 'expense', _id,
      format('%s edited %s: %s', _actor, _new.description, array_to_string(_changes, '; ')),
      _prev, public._expense_json(_new), _before, _after, _aud
    );

    IF _cur.division_mode <> _new.division_mode THEN
      PERFORM public._audit_group_event(
        _group_id, 'division_mode_changed', 'expense', _id,
        format('%s changed division mode of %s from %s to %s', _actor, _new.description,
               initcap(replace(_cur.division_mode, '_', ' ')),
               initcap(replace(_new.division_mode, '_', ' '))),
        jsonb_build_object('division_mode', _cur.division_mode),
        jsonb_build_object('division_mode', _new.division_mode), _before, _after, _aud
      );
    END IF;

    IF _cur.paid_by <> _new.paid_by THEN
      PERFORM public._audit_group_event(
        _group_id, 'payer_changed', 'expense', _id,
        format('%s changed the payer of %s', _actor, _new.description),
        jsonb_build_object('paid_by', _cur.paid_by),
        jsonb_build_object('paid_by', _new.paid_by), NULL, NULL, _aud
      );
    END IF;
  END IF;

  IF _is_edit AND _cur.visibility <> _new.visibility THEN
    PERFORM public._audit_group_event(
      _group_id, 'visibility_changed', 'expense', _id,
      format('%s changed %s from %s to %s', _actor, _new.description,
             CASE _cur.visibility WHEN 'group' THEN 'visible to everyone'
                  ELSE 'visible only to members sharing it' END,
             CASE _new.visibility WHEN 'group' THEN 'visible to everyone'
                  ELSE 'visible only to members sharing it' END),
      jsonb_build_object('visibility', _cur.visibility),
      jsonb_build_object('visibility', _new.visibility), NULL, NULL, _aud
    );
  END IF;

  RETURN jsonb_build_object('id', _id, 'version', _new.version);
END;
$$;

REVOKE ALL ON FUNCTION public.save_group_expense(
  UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, DATE, TEXT, JSONB, INTEGER, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_group_expense(
  UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, DATE, TEXT, JSONB, INTEGER, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_group_ledger(_group_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN public.is_user_blocked() THEN NULL ELSE
    jsonb_build_object(
      'group_id', g.id,
      'currency', g.currency,
      'version', g.financial_version,
      'hidden_count', public._hidden_expense_count(g.id),
      'expenses', COALESCE((
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.expense_date DESC, e.created_at DESC)
        FROM public.group_expenses e
        WHERE e.group_id = g.id AND e.deleted_at IS NULL
      ), '[]'::jsonb),
      'splits', COALESCE((
        SELECT jsonb_agg(to_jsonb(s))
        FROM public.group_expense_splits s
        JOIN public.group_expenses e ON e.id = s.expense_id
        WHERE e.group_id = g.id AND e.deleted_at IS NULL
      ), '[]'::jsonb),
      'settlements', COALESCE((
        SELECT jsonb_agg(to_jsonb(t) ORDER BY t.settled_at DESC, t.created_at DESC)
        FROM public.group_settlements t
        WHERE t.group_id = g.id AND t.deleted_at IS NULL
      ), '[]'::jsonb)
    ) END
  FROM public.groups g
  WHERE g.id = _group_id AND public.is_group_member(g.id);
$$;
REVOKE ALL ON FUNCTION public.get_group_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_ledger(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_group_expense(_expense_id UUID, _expected_version INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _uid UUID := auth.uid(); _e public.group_expenses%ROWTYPE; _cur TEXT; _alloc JSONB;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _e FROM public.group_expenses WHERE id = _expense_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_e.group_id) THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF _e.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This expense was already deleted'; END IF;
  IF NOT (_e.user_id = _uid OR (public.is_group_admin(_e.group_id) AND public.can_see_expense(_e.id))) THEN
    RAISE EXCEPTION 'Only the creator or group admin can delete this expense' USING ERRCODE = '42501';
  END IF;
  IF _expected_version IS DISTINCT FROM _e.version THEN
    RAISE EXCEPTION 'CONFLICT: this expense was changed by someone else. Reload and try again.' USING ERRCODE = '40001';
  END IF;
  SELECT currency INTO _cur FROM public.groups WHERE id = _e.group_id;
  _alloc := public._expense_allocation_json(_e.id);
  UPDATE public.group_expenses
  SET deleted_at = now(), deleted_by = _uid, version = version + 1
  WHERE id = _e.id;
  PERFORM public._sync_expense_mirror(_e.id);
  PERFORM public._bump_group_version(_e.group_id);
  PERFORM public._audit_group_event(
    _e.group_id, 'expense_deleted', 'expense', _e.id,
    format('%s deleted %s — %s', public.group_actor_name(_e.group_id), _e.description, public.fmt_money(_e.amount, _cur)),
    public._expense_json(_e), NULL, _alloc, NULL,
    CASE WHEN _e.visibility = 'participants' THEN public._expense_audience(_e.id) END
  );
  RETURN jsonb_build_object('id', _e.id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_group_expense(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_group_expense(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_group_expense(_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE _uid UUID := auth.uid(); _e public.group_expenses%ROWTYPE; _cur TEXT; _alloc JSONB;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _e FROM public.group_expenses WHERE id = _expense_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_group_member(_e.group_id) THEN RAISE EXCEPTION 'Expense not found'; END IF;
  IF _e.deleted_at IS NULL THEN RAISE EXCEPTION 'This expense is not deleted'; END IF;
  IF NOT (_e.user_id = _uid OR (public.is_group_admin(_e.group_id) AND public.can_see_expense(_e.id))) THEN
    RAISE EXCEPTION 'Only the creator or group admin can restore this expense' USING ERRCODE = '42501';
  END IF;
  SELECT currency INTO _cur FROM public.groups WHERE id = _e.group_id;
  UPDATE public.group_expenses
  SET deleted_at = NULL, deleted_by = NULL, version = version + 1
  WHERE id = _e.id;
  _alloc := public._expense_allocation_json(_e.id);
  PERFORM public._sync_expense_mirror(_e.id);
  PERFORM public._bump_group_version(_e.group_id);
  PERFORM public._audit_group_event(
    _e.group_id, 'expense_restored', 'expense', _e.id,
    format('%s restored %s — %s', public.group_actor_name(_e.group_id), _e.description, public.fmt_money(_e.amount, _cur)),
    NULL, public._expense_json(_e), NULL, _alloc,
    CASE WHEN _e.visibility = 'participants' THEN public._expense_audience(_e.id) END
  );
  RETURN jsonb_build_object('id', _e.id);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_group_expense(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_group_expense(UUID) TO authenticated;
