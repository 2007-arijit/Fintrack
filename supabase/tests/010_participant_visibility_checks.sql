-- Scenario checks for migration 010. NOT AUTOMATED and NOT YET EXECUTED (written without a Postgres
-- instance). Run on a disposable project after 001–010; everything rolls back.
-- Replace the 3 UUIDs with real auth.users ids (three different users).
BEGIN;
DO $$
DECLARE
  u1 UUID := '00000000-0000-0000-0000-0000000000a1'; -- TODO real user: admin, family 1
  u2 UUID := '00000000-0000-0000-0000-0000000000b2'; -- TODO real user: family 2
  u3 UUID := '00000000-0000-0000-0000-0000000000c3'; -- TODO real user: family 3 (not sharing)
  g UUID; m1 UUID; m2 UUID; m3 UUID; eid UUID; v INT; n INT; res JSONB;
  allocs JSONB;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.groups (user_id, name) VALUES (u1, 'T') RETURNING id INTO g;
  INSERT INTO public.group_members (group_id, user_id, member_user_id, name) VALUES (g, u1, u1, 'F1') RETURNING id INTO m1;
  RESET ROLE;
  INSERT INTO public.group_members (group_id, user_id, member_user_id, name) VALUES (g, u1, u2, 'F2') RETURNING id INTO m2;
  INSERT INTO public.group_members (group_id, user_id, member_user_id, name) VALUES (g, u1, u3, 'F3') RETURNING id INTO m3;
  allocs := jsonb_build_array(
    jsonb_build_object('member_id', m1, 'share_amount', 500, 'weight', 1, 'member_count', 1, 'mode', 'solo'),
    jsonb_build_object('member_id', m2, 'share_amount', 500, 'weight', 1, 'member_count', 1, 'mode', 'solo'));

  -- F1 adds a Personal expense shared by F1 + F2
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  res := public.save_group_expense(NULL, g, 'Hotel', 1000, 'food', m1, 'per_family', NULL, CURRENT_DATE, NULL, allocs, NULL, 'participants');
  eid := (res->>'id')::uuid;
  IF jsonb_array_length(public.get_group_ledger(g)->'expenses') <> 1 THEN RAISE EXCEPTION 'F1 cannot see own expense'; END IF;

  -- F2 (sharer) sees expense, splits and audit
  RESET ROLE; PERFORM set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true); SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.group_expenses WHERE id = eid) <> 1 THEN RAISE EXCEPTION 'sharer cannot see expense'; END IF;
  IF (SELECT count(*) FROM public.group_expense_splits WHERE expense_id = eid) <> 2 THEN RAISE EXCEPTION 'sharer cannot see splits'; END IF;
  IF (SELECT count(*) FROM public.group_audit_events WHERE entity_id = eid) < 1 THEN RAISE EXCEPTION 'sharer cannot see audit'; END IF;

  -- F3 (not sharing): no expense, no splits, no audit, no ledger entry, no charge; hidden_count = 1
  RESET ROLE; PERFORM set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true); SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.group_expenses WHERE id = eid) <> 0 THEN RAISE EXCEPTION 'non-sharer can read expense'; END IF;
  IF (SELECT count(*) FROM public.group_expense_splits WHERE expense_id = eid) <> 0 THEN RAISE EXCEPTION 'non-sharer can read splits'; END IF;
  IF (SELECT count(*) FROM public.group_audit_events WHERE entity_id = eid) <> 0 THEN RAISE EXCEPTION 'non-sharer can read audit'; END IF;
  IF jsonb_array_length(public.get_group_ledger(g)->'expenses') <> 0 THEN RAISE EXCEPTION 'expense in non-sharer ledger'; END IF;
  IF (public.get_group_ledger(g)->>'hidden_count')::int <> 1 THEN RAISE EXCEPTION 'hidden_count wrong'; END IF;
  BEGIN PERFORM public.delete_group_expense(eid, 1); RAISE EXCEPTION 'non-sharer deleted expense';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- old unrestricted 12-argument save function no longer exists (cannot bypass visibility)
  IF to_regprocedure('public.save_group_expense(uuid,uuid,text,numeric,text,uuid,text,text,date,text,jsonb,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'old save_group_expense overload still present'; END IF;

  -- visibility switch to group: F3 now sees it and its history
  RESET ROLE; PERFORM set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true); SET LOCAL ROLE authenticated;
  SELECT version INTO v FROM public.group_expenses WHERE id = eid;
  PERFORM public.save_group_expense(eid, g, 'Hotel', 1000, 'food', m1, 'per_family', NULL, CURRENT_DATE, NULL, NULL, v, 'group');
  RESET ROLE; PERFORM set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true); SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.group_expenses WHERE id = eid) <> 1 THEN RAISE EXCEPTION 'expense not visible after switching to group'; END IF;

  RAISE NOTICE '010 scenario checks passed';
END $$;
ROLLBACK;
