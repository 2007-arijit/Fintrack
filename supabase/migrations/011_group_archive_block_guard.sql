-- ============================================================
-- FinTrack — Safe group archiving and legacy preference backfill
-- Corrected Migration 011
-- Run after corrected migrations 007–010.
--
-- Archived groups remain readable; financial/member mutations are blocked.
-- Blocked accounts are also prevented from using this trigger path.
-- ============================================================

-- Accounts that existed before migration 001 did not receive the
-- handle_new_user() trigger row. Backfill only missing preferences.
INSERT INTO public.user_preferences (user_id, display_name)
SELECT
  u.id,
  COALESCE(
    NULLIF(BTRIM(u.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(SPLIT_PART(COALESCE(u.email, ''), '@', 1), ''),
    'Member'
  )
FROM auth.users AS u
ON CONFLICT (user_id) DO NOTHING;

-- A group archive is a reversible state change, not a destructive delete.
-- Keep the existing groups.archived column and existing read policies.
CREATE OR REPLACE FUNCTION public.reject_archived_group_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _group_id UUID;
  _expense_id UUID;
BEGIN
  -- RLS is not sufficient for calls made through SECURITY DEFINER RPCs.
  -- Check the authenticated caller explicitly before allowing any mutation.
  IF auth.uid() IS NOT NULL AND public.is_user_blocked() THEN
    RAISE EXCEPTION 'Your account is temporarily blocked from making changes.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'group_expense_splits' THEN
    IF TG_OP = 'DELETE' THEN
      _expense_id := OLD.expense_id;
    ELSE
      _expense_id := NEW.expense_id;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.expense_id IS DISTINCT FROM NEW.expense_id THEN
      RAISE EXCEPTION 'An expense allocation cannot be moved to another expense';
    END IF;

    SELECT e.group_id INTO _group_id
    FROM public.group_expenses AS e
    WHERE e.id = _expense_id;
  ELSE
    IF TG_OP = 'DELETE' THEN
      _group_id := OLD.group_id;
    ELSE
      _group_id := NEW.group_id;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'A group record cannot be moved to another group';
    END IF;
  END IF;

  IF _group_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.groups AS g
    WHERE g.id = _group_id
      AND g.archived = true
  ) THEN
    RAISE EXCEPTION 'This group is archived. Unarchive it before making changes.'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_archived_group_members ON public.group_members;
CREATE TRIGGER reject_archived_group_members
BEFORE INSERT OR UPDATE OR DELETE ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.reject_archived_group_mutations();

DROP TRIGGER IF EXISTS reject_archived_group_expenses ON public.group_expenses;
CREATE TRIGGER reject_archived_group_expenses
BEFORE INSERT OR UPDATE OR DELETE ON public.group_expenses
FOR EACH ROW
EXECUTE FUNCTION public.reject_archived_group_mutations();

DROP TRIGGER IF EXISTS reject_archived_group_expense_splits ON public.group_expense_splits;
CREATE TRIGGER reject_archived_group_expense_splits
BEFORE INSERT OR UPDATE OR DELETE ON public.group_expense_splits
FOR EACH ROW
EXECUTE FUNCTION public.reject_archived_group_mutations();

DROP TRIGGER IF EXISTS reject_archived_group_settlements ON public.group_settlements;
CREATE TRIGGER reject_archived_group_settlements
BEFORE INSERT OR UPDATE OR DELETE ON public.group_settlements
FOR EACH ROW
EXECUTE FUNCTION public.reject_archived_group_mutations();

DROP TRIGGER IF EXISTS reject_archived_group_invites ON public.group_invites;
CREATE TRIGGER reject_archived_group_invites
BEFORE INSERT OR UPDATE OR DELETE ON public.group_invites
FOR EACH ROW
EXECUTE FUNCTION public.reject_archived_group_mutations();

COMMENT ON COLUMN public.groups.archived IS
  'When true, the group and its financial history remain readable, but group/member/financial mutations are blocked. The owner may unarchive it.';
