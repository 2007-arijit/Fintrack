-- ============================================================
-- Scenario checks for migration 008. NOT AUTOMATED and NOT YET EXECUTED
-- (authored without a Postgres instance). Run on a disposable Supabase
-- project / local `supabase start` after applying 001–008. Everything runs
-- in one transaction and rolls back. Each check RAISEs on failure.
-- Replace the two UUIDs with real auth.users ids (admin + outsider).
-- ============================================================
BEGIN;
DO $$
DECLARE
  admin_id UUID := '00000000-0000-0000-0000-0000000000a1';   -- TODO: real user
  other_id UUID := '00000000-0000-0000-0000-0000000000b2';   -- TODO: real user, NOT in group
  g UUID; mA UUID; mB UUID; mC UUID; eid UUID; v INT; n INT; led JSONB;
  as_user TEXT;
BEGIN
  -- helper: act as a user (RLS + auth.uid())
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.groups (user_id, name, currency) VALUES (admin_id, 'T', 'INR') RETURNING id INTO g;
  INSERT INTO public.group_members (group_id, user_id, member_user_id, name, is_you, participation_mode, member_count)
    VALUES (g, admin_id, admin_id, 'Fam A', true, 'family', 3) RETURNING id INTO mA;
  INSERT INTO public.group_members (group_id, user_id, name, participation_mode, member_count) VALUES (g, admin_id, 'Fam B', 'family', 3) RETURNING id INTO mB;
  INSERT INTO public.group_members (group_id, user_id, name, participation_mode, member_count) VALUES (g, admin_id, 'Fam C', 'family', 2) RETURNING id INTO mC;

  -- constraints: solo must be 1, family >= 2
  BEGIN INSERT INTO public.group_members (group_id,user_id,name,participation_mode,member_count) VALUES (g,admin_id,'bad','solo',3);
        RAISE EXCEPTION 'solo with 3 people must be rejected'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.group_members (group_id,user_id,name,participation_mode,member_count) VALUES (g,admin_id,'bad','family',0);
        RAISE EXCEPTION 'count 0 must be rejected'; EXCEPTION WHEN check_violation THEN NULL; END;

  -- 1. create: per_person 8000 over 3/3/2 → 3000/3000/2000, one audit event
  SELECT (public.save_group_expense(NULL, g, 'Hotel', 8000, 'food', mA, 'per_person', NULL, CURRENT_DATE, NULL,
    jsonb_build_array(
      jsonb_build_object('member_id', mA, 'share_amount', 3000, 'weight', 3, 'member_count', 3, 'mode', 'family'),
      jsonb_build_object('member_id', mB, 'share_amount', 3000, 'weight', 3, 'member_count', 3, 'mode', 'family'),
      jsonb_build_object('member_id', mC, 'share_amount', 2000, 'weight', 2, 'member_count', 2, 'mode', 'family')), NULL)->>'id')::uuid INTO eid;
  SELECT count(*) INTO n FROM public.group_audit_events WHERE entity_id = eid AND action = 'expense_created';
  IF n <> 1 THEN RAISE EXCEPTION 'expected exactly 1 expense_created event, got %', n; END IF;

  -- 2. wrong allocation (does not sum / not proportional) is rejected and writes NO audit event
  BEGIN
    PERFORM public.save_group_expense(NULL, g, 'Bad', 8000, 'food', mA, 'per_person', NULL, CURRENT_DATE, NULL,
      jsonb_build_array(jsonb_build_object('member_id', mA, 'share_amount', 8000, 'weight', 3, 'member_count', 3, 'mode', 'family'),
                        jsonb_build_object('member_id', mB, 'share_amount', 0, 'weight', 3, 'member_count', 3, 'mode', 'family')), NULL);
    RAISE EXCEPTION 'disproportionate allocation must be rejected';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'disproportionate%' THEN RAISE; END IF; END;
  SELECT count(*) INTO n FROM public.group_audit_events WHERE group_id = g AND description LIKE '%Bad%';
  IF n <> 0 THEN RAISE EXCEPTION 'failed mutation produced an audit event'; END IF;

  -- 3. stale participant counts are rejected
  BEGIN
    PERFORM public.save_group_expense(NULL, g, 'Stale', 8000, 'food', mA, 'per_family', NULL, CURRENT_DATE, NULL,
      jsonb_build_array(jsonb_build_object('member_id', mA, 'share_amount', 8000, 'weight', 1, 'member_count', 99, 'mode', 'family')), NULL);
    RAISE EXCEPTION 'stale member_count must be rejected';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  -- 4. optimistic concurrency: edit with wrong version → CONFLICT
  SELECT version INTO v FROM public.group_expenses WHERE id = eid;
  BEGIN
    PERFORM public.save_group_expense(eid, g, 'Hotel', 8000, 'food', mA, 'per_person', NULL, CURRENT_DATE, 'x', NULL, v + 5);
    RAISE EXCEPTION 'version conflict must be rejected';
  EXCEPTION WHEN serialization_failure THEN NULL; END;

  -- 5. edit keeping allocations (notes only) bumps version, audits, does not touch splits
  PERFORM public.save_group_expense(eid, g, 'Hotel', 8000, 'food', mA, 'per_person', NULL, CURRENT_DATE, 'note', NULL, v);
  SELECT count(*) INTO n FROM public.group_audit_events WHERE entity_id = eid AND action = 'expense_updated';
  IF n <> 1 THEN RAISE EXCEPTION 'expected 1 expense_updated event'; END IF;

  -- 6. family size change must not alter historical split; audited
  PERFORM public.update_group_participant(mC, 'Fam C', 'family', 3, NULL);
  SELECT member_count_at_time INTO n FROM public.group_expense_splits WHERE expense_id = eid AND member_id = mC;
  IF n <> 2 THEN RAISE EXCEPTION 'historical member_count_at_time changed'; END IF;
  SELECT count(*) INTO n FROM public.group_audit_events WHERE group_id = g AND action = 'member_count_changed';
  IF n <> 1 THEN RAISE EXCEPTION 'member count change not audited'; END IF;

  -- 7. settlement + delete → ledger excludes deleted, audit keeps original
  PERFORM public.record_group_settlement(g, mB, mA, 1000, CURRENT_DATE, NULL, false);
  SELECT version INTO v FROM public.group_expenses WHERE id = eid;
  PERFORM public.delete_group_expense(eid, v);
  led := public.get_group_ledger(g);
  IF jsonb_array_length(led->'expenses') <> 0 THEN RAISE EXCEPTION 'deleted expense still in ledger'; END IF;
  IF jsonb_array_length(led->'splits') <> 0 THEN RAISE EXCEPTION 'deleted expense splits still in ledger'; END IF;
  SELECT count(*) INTO n FROM public.group_audit_events WHERE entity_id = eid AND action = 'expense_deleted'
    AND previous_values->>'description' = 'Hotel' AND jsonb_array_length(allocation_before) = 3;
  IF n <> 1 THEN RAISE EXCEPTION 'delete audit event missing original values/allocation'; END IF;
  IF (SELECT count(*) FROM public.group_expenses WHERE id = eid) <> 1 THEN RAISE EXCEPTION 'row was hard-deleted'; END IF;

  -- 8. direct writes to financial + audit tables are impossible
  BEGIN DELETE FROM public.group_audit_events WHERE group_id = g; RAISE EXCEPTION 'audit delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.group_audit_events (group_id, action, entity_type, description) VALUES (g,'x','x','forged'); RAISE EXCEPTION 'audit forge allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.group_expenses SET amount = 1 WHERE id = eid; RAISE EXCEPTION 'direct expense update allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- 9. outsider: no ledger, no audit rows, cannot mutate
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', other_id, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF public.get_group_ledger(g) IS NOT NULL THEN RAISE EXCEPTION 'outsider can read ledger'; END IF;
  IF (SELECT count(*) FROM public.group_audit_events WHERE group_id = g) <> 0 THEN RAISE EXCEPTION 'outsider can read audit'; END IF;
  BEGIN PERFORM public.save_group_expense(NULL, g, 'x', 10, 'food', mA, 'personal', NULL, CURRENT_DATE, NULL,
          jsonb_build_array(jsonb_build_object('member_id', mA, 'share_amount', 10, 'weight', 1, 'member_count', 3, 'mode', 'family')), NULL);
        RAISE EXCEPTION 'outsider mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  RAISE NOTICE '008 scenario checks passed';
END $$;
ROLLBACK;
