-- FinTrack replacement Migration 007 (first-stage blocking controls)
-- IMPORTANT:
-- 1) Run only after migrations 001-006.
-- 2) Do NOT run the original 007_admin_push_notifications.sql as well.
-- 3) This is NOT the final end-to-end block guarantee. Migrations 008-011
--    add/redefine SECURITY DEFINER functions and tables; post-011 hardening
--    is still required before claiming all direct API/RPC access is blocked.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS is_developer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.is_user_blocked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((
    SELECT up.blocked_until > now()
    FROM public.user_preferences AS up
    WHERE up.user_id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_user_blocked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_blocked() TO authenticated;

-- Deliberately NOT SECURITY DEFINER: direct authenticated writes must be
-- evaluated as the authenticated role. Admin RPCs execute as their owner.
CREATE OR REPLACE FUNCTION public.protect_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_developer := false;
      NEW.blocked_until := NULL;
    ELSE
      NEW.is_developer := OLD.is_developer;
      NEW.blocked_until := OLD.blocked_until;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_privileged_columns ON public.user_preferences;
CREATE TRIGGER trg_protect_privileged_columns
BEFORE INSERT OR UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_columns();

CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT NOT public.is_user_blocked()
     AND COALESCE((
       SELECT up.is_developer
       FROM public.user_preferences AS up
       WHERE up.user_id = auth.uid()
     ), false);
$$;

REVOKE ALL ON FUNCTION public.is_developer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_developer() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_user_stats()
RETURNS TABLE (total_users bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NOT public.is_developer() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT count(*) FROM auth.users;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_list()
RETURNS TABLE (
  user_id uuid, email text, display_name text, username text,
  created_at timestamptz, last_seen_at timestamptz, blocked_until timestamptz,
  is_developer boolean, chat_messages_sent bigint, chat_rate_per_day numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NOT public.is_developer() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT au.id, au.email::text, up.display_name, up.username, au.created_at,
         up.last_seen_at, up.blocked_until, COALESCE(up.is_developer, false),
         COALESCE(cm.msg_count, 0)::bigint,
         round(COALESCE(cm.msg_count, 0)::numeric /
           greatest(1, extract(day FROM (now() - au.created_at))::numeric), 2)
  FROM auth.users au
  LEFT JOIN public.user_preferences up ON up.user_id = au.id
  LEFT JOIN (
    SELECT sender_id, count(*) AS msg_count
    FROM public.chat_messages
    WHERE deleted_at IS NULL
    GROUP BY sender_id
  ) cm ON cm.sender_id = au.id
  ORDER BY au.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _hours numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NOT public.is_developer() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid target user';
  END IF;
  IF _hours IS NULL OR _hours <= 0 OR _hours > 8760 THEN
    RAISE EXCEPTION 'Duration must be greater than 0 and no more than 8760 hours';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_preferences
    WHERE user_id = _user_id AND is_developer = true
  ) THEN
    RAISE EXCEPTION 'Cannot block a developer account';
  END IF;

  UPDATE public.user_preferences
  SET blocked_until = now() + make_interval(secs => (_hours * 3600)::double precision)
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User preferences row not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unblock_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NOT public.is_developer() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_preferences
  SET blocked_until = NULL
  WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_user_list() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_block_user(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unblock_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_user(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions(user_id);

DROP POLICY IF EXISTS "Users manage own push subscription" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscription"
ON public.push_subscriptions FOR ALL TO authenticated
USING (auth.uid() = user_id AND NOT public.is_user_blocked())
WITH CHECK (auth.uid() = user_id AND NOT public.is_user_blocked());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','budgets','debts','debt_settlements','monthly_balances',
    'groups','group_members','group_expenses','group_expense_splits',
    'group_settlements','friend_requests','group_invites',
    'uploaded_imports','conversations','chat_messages'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS block_access_while_suspended ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY block_access_while_suspended ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_user_blocked()) WITH CHECK (NOT public.is_user_blocked())',
        t
      );
    END IF;
  END LOOP;
END;
$$;

-- Allow a blocked user to read only their own preferences row for the
-- suspension-expiry screen. All preference writes remain blocked.
DROP POLICY IF EXISTS blocked_user_own_preferences_read ON public.user_preferences;
CREATE POLICY blocked_user_own_preferences_read
ON public.user_preferences AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.is_user_blocked() OR user_id = auth.uid());

DROP POLICY IF EXISTS block_preferences_writes_while_suspended ON public.user_preferences;
CREATE POLICY block_preferences_writes_while_suspended
ON public.user_preferences AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT public.is_user_blocked());

DROP POLICY IF EXISTS block_preferences_updates_while_suspended ON public.user_preferences;
CREATE POLICY block_preferences_updates_while_suspended
ON public.user_preferences AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT public.is_user_blocked())
WITH CHECK (NOT public.is_user_blocked());

DROP POLICY IF EXISTS block_preferences_deletes_while_suspended ON public.user_preferences;
CREATE POLICY block_preferences_deletes_while_suspended
ON public.user_preferences AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT public.is_user_blocked());

-- IMPORTANT: This file is a replacement for original 007 only. It does not
-- complete blocking for SECURITY DEFINER RPCs introduced/replaced in 008-011.
