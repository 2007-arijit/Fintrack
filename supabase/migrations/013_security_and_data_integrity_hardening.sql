-- ============================================================
-- FinTrack 013 — Security, chat integrity, and data lifecycle hardening
-- Apply after migrations 001–012. Additive/forward-only; no database reset.
-- ============================================================

-- 1) Stop direct hard-deletion of groups. Groups are archived instead.
DROP POLICY IF EXISTS "Admin can delete group" ON public.groups;
DROP POLICY IF EXISTS "Users can delete own groups" ON public.groups;
REVOKE DELETE ON public.groups FROM anon, authenticated;

-- 2) Enforce the username cooldown in PostgreSQL, not only in the UI.
CREATE OR REPLACE FUNCTION public.enforce_username_change_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Trusted server-side operations may perform administrative repairs.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.username IS DISTINCT FROM OLD.username THEN
    -- One-time revert to the immediately previous username; it consumes the slot.
    IF OLD.previous_username IS NOT NULL AND NEW.username = OLD.previous_username THEN
      NEW.previous_username := NULL;
      NEW.username_updated_at := now();
      RETURN NEW;
    END IF;

    IF OLD.username_updated_at IS NOT NULL
       AND OLD.username_updated_at > now() - interval '14 days' THEN
      RAISE EXCEPTION 'Username can only be changed once every 14 days.'
        USING ERRCODE = '23514';
    END IF;

    NEW.previous_username := OLD.username;
    NEW.username_updated_at := now();
  ELSE
    -- Clients cannot forge the cooldown timestamp or previous-name slot.
    NEW.previous_username := OLD.previous_username;
    NEW.username_updated_at := OLD.username_updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_username_change_rules ON public.user_preferences;
CREATE TRIGGER trg_enforce_username_change_rules
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW EXECUTE FUNCTION public.enforce_username_change_rules();

-- User profile writes are limited to fields actually edited by the app.
REVOKE INSERT, UPDATE, DELETE ON public.user_preferences FROM anon, authenticated;
GRANT SELECT ON public.user_preferences TO authenticated;
GRANT UPDATE (display_name, currency, monthly_budget_default, username, avatar_url, upi_id, last_seen_at)
  ON public.user_preferences TO authenticated;

-- 3) Friend requests: permit the sender to cancel only a pending request.
DROP POLICY IF EXISTS "Senders can cancel pending requests" ON public.friend_requests;
CREATE POLICY "Senders can cancel pending requests"
  ON public.friend_requests FOR DELETE TO authenticated
  USING (sender_id = auth.uid() AND status = 'pending');

REVOKE INSERT, UPDATE, DELETE ON public.friend_requests FROM anon, authenticated;
GRANT SELECT ON public.friend_requests TO authenticated;
GRANT INSERT (sender_id, receiver_id) ON public.friend_requests TO authenticated;
GRANT UPDATE (status) ON public.friend_requests TO authenticated;
GRANT DELETE ON public.friend_requests TO authenticated;

-- 4) Chat: clients may create messages but cannot impersonate, alter timestamps,
--    mark arbitrary messages as read, or modify another person's message.
CREATE OR REPLACE FUNCTION public.are_friends(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT public.is_user_blocked()
    AND (auth.uid() = _a OR auth.uid() = _b)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_preferences up
      WHERE up.user_id IN (_a, _b)
        AND up.blocked_until IS NOT NULL
        AND up.blocked_until > now()
    )
    AND EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND ((fr.sender_id = _a AND fr.receiver_id = _b)
          OR (fr.sender_id = _b AND fr.receiver_id = _a))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NOT public.is_user_blocked()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = _conversation_id
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
        AND public.are_friends(c.user_a, c.user_b)
    );
$$;

DROP POLICY IF EXISTS "Participants can send messages" ON public.chat_messages;
CREATE POLICY "Current friends can send messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_participant(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND public.are_friends(c.user_a, c.user_b)
    )
  );

DROP POLICY IF EXISTS "Sender can update own message" ON public.chat_messages;
REVOKE ALL ON public.conversations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_messages FROM anon, authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;
GRANT INSERT (conversation_id, sender_id, content) ON public.chat_messages TO authenticated;

-- The monthly cap is serialized per sender/conversation and timestamps are server-owned.
CREATE OR REPLACE FUNCTION public.enforce_chat_monthly_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _a UUID;
  _b UUID;
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NEW.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Invalid message sender.' USING ERRCODE = '42501';
  END IF;
  IF public.is_user_blocked() THEN
    RAISE EXCEPTION 'Account is temporarily blocked.' USING ERRCODE = '42501';
  END IF;

  SELECT c.user_a, c.user_b INTO _a, _b
  FROM public.conversations c WHERE c.id = NEW.conversation_id;
  IF NOT FOUND OR (auth.uid() <> _a AND auth.uid() <> _b) THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.are_friends(_a, _b) THEN
    RAISE EXCEPTION 'You can only message current friends.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.conversation_id::text || ':' || NEW.sender_id::text, 0));
  SELECT count(*)::INTEGER INTO _count
  FROM public.chat_messages m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.sender_id = NEW.sender_id
    AND m.created_at >= date_trunc('month', now())
    AND m.created_at < date_trunc('month', now()) + interval '1 month';

  IF _count >= 60 THEN
    RAISE EXCEPTION 'Monthly chat limit reached.' USING ERRCODE = 'P0001';
  END IF;

  NEW.created_at := now();
  NEW.read_at := NULL;
  NEW.deleted_at := NULL;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_friend_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _me UUID := auth.uid();
  _a UUID;
  _b UUID;
  _id UUID;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked.' USING ERRCODE = '42501'; END IF;
  IF _friend_id IS NULL OR _friend_id = _me OR NOT public.are_friends(_me, _friend_id) THEN
    RAISE EXCEPTION 'You can only chat with a current friend.' USING ERRCODE = '42501';
  END IF;

  IF _me < _friend_id THEN _a := _me; _b := _friend_id;
  ELSE _a := _friend_id; _b := _me; END IF;

  INSERT INTO public.conversations (user_a, user_b)
  VALUES (_a, _b)
  ON CONFLICT (user_a, user_b) DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.conversations WHERE user_a = _a AND user_b = _b;
  END IF;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_message_count(_conversation_id UUID)
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN public.is_conversation_participant(_conversation_id) THEN
    (SELECT count(*)::INTEGER FROM public.chat_messages m
     WHERE m.conversation_id = _conversation_id
       AND m.sender_id = auth.uid()
       AND m.created_at >= date_trunc('month', now())
       AND m.created_at < date_trunc('month', now()) + interval '1 month')
  ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_conversation_participant(_conversation_id) THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '42501';
  END IF;
  IF public.is_user_blocked() THEN
    RAISE EXCEPTION 'Account is temporarily blocked.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.chat_messages
  SET read_at = now()
  WHERE conversation_id = _conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_chat_message(_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked.' USING ERRCODE = '42501'; END IF;

  UPDATE public.chat_messages
  SET deleted_at = now(), content = 'Message deleted'
  WHERE id = _message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found or you cannot delete it.' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (friend_id UUID, username TEXT, display_name TEXT, avatar_url TEXT)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT up.user_id, up.username, up.display_name, up.avatar_url
  FROM public.friend_requests fr
  JOIN public.user_preferences up
    ON up.user_id = CASE WHEN fr.sender_id = auth.uid() THEN fr.receiver_id ELSE fr.sender_id END
  WHERE auth.uid() IS NOT NULL AND NOT public.is_user_blocked()
    AND fr.status = 'accepted'
    AND (fr.sender_id = auth.uid() OR fr.receiver_id = auth.uid())
    AND (up.blocked_until IS NULL OR up.blocked_until <= now());
$$;

CREATE OR REPLACE FUNCTION public.get_incoming_requests()
RETURNS TABLE (request_id UUID, user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT fr.id, up.user_id, up.username, up.display_name, up.avatar_url, fr.created_at
  FROM public.friend_requests fr
  JOIN public.user_preferences up ON up.user_id = fr.sender_id
  WHERE auth.uid() IS NOT NULL AND NOT public.is_user_blocked()
    AND fr.receiver_id = auth.uid() AND fr.status = 'pending'
    AND (up.blocked_until IS NULL OR up.blocked_until <= now())
  ORDER BY fr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_outgoing_requests()
RETURNS TABLE (request_id UUID, user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT fr.id, up.user_id, up.username, up.display_name, up.avatar_url, fr.created_at
  FROM public.friend_requests fr
  JOIN public.user_preferences up ON up.user_id = fr.receiver_id
  WHERE auth.uid() IS NOT NULL AND NOT public.is_user_blocked()
    AND fr.sender_id = auth.uid() AND fr.status = 'pending'
    AND (up.blocked_until IS NULL OR up.blocked_until <= now())
  ORDER BY fr.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.search_users(_query TEXT)
RETURNS TABLE (user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT up.user_id, up.username, up.display_name, up.avatar_url
  FROM public.user_preferences up
  WHERE auth.uid() IS NOT NULL AND NOT public.is_user_blocked()
    AND length(btrim(COALESCE(_query, ''))) BETWEEN 2 AND 32
    AND up.username IS NOT NULL
    AND position(lower(btrim(_query)) in lower(up.username)) > 0
    AND (up.blocked_until IS NULL OR up.blocked_until <= now())
    AND up.user_id <> auth.uid()
  ORDER BY up.username
  LIMIT 20;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(_friend_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked.' USING ERRCODE = '42501'; END IF;
  IF _friend_id IS NULL OR _friend_id = auth.uid() THEN RAISE EXCEPTION 'Invalid friend.'; END IF;

  DELETE FROM public.friend_requests
  WHERE status = 'accepted'
    AND ((sender_id = auth.uid() AND receiver_id = _friend_id)
      OR (sender_id = _friend_id AND receiver_id = auth.uid()));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_conversations()
RETURNS TABLE (
  conversation_id UUID, friend_id UUID, friend_username TEXT, friend_display_name TEXT,
  friend_avatar_url TEXT, last_message TEXT, last_message_at TIMESTAMPTZ, unread_count INTEGER
)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT c.id, up.user_id, up.username, up.display_name, up.avatar_url,
    (SELECT CASE WHEN m.deleted_at IS NULL THEN m.content ELSE 'Message deleted' END
     FROM public.chat_messages m WHERE m.conversation_id = c.id
     ORDER BY m.created_at DESC LIMIT 1),
    c.last_message_at,
    (SELECT count(*)::INTEGER FROM public.chat_messages m
     WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid()
       AND m.read_at IS NULL AND m.deleted_at IS NULL)
  FROM public.conversations c
  JOIN public.user_preferences up
    ON up.user_id = CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END
  WHERE auth.uid() IS NOT NULL AND NOT public.is_user_blocked()
    AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND public.are_friends(c.user_a, c.user_b)
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_total_unread_count()
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR public.is_user_blocked() THEN 0 ELSE
    (SELECT count(*)::INTEGER
     FROM public.chat_messages m
     JOIN public.conversations c ON c.id = m.conversation_id
     WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
       AND public.are_friends(c.user_a, c.user_b)
       AND m.sender_id <> auth.uid()
       AND m.read_at IS NULL AND m.deleted_at IS NULL)
  END;
$$;

-- Remove the public/default EXECUTE grants left by the initial RPC migrations.
REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_or_create_conversation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_monthly_message_count(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_total_unread_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_conversations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_friends() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_incoming_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_outgoing_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_users(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_friend(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_chat_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_message_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incoming_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_outgoing_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(UUID) TO authenticated;

-- 5) Limit sensitive writes to the fields and roles that need them.
REVOKE INSERT, UPDATE, DELETE ON public.group_invites FROM anon, authenticated;
GRANT SELECT ON public.group_invites TO authenticated;
GRANT INSERT (group_id, created_by) ON public.group_invites TO authenticated;
GRANT UPDATE (active) ON public.group_invites TO authenticated;

-- Settlements must reference a debt owned by the caller.
DROP POLICY IF EXISTS "Users can insert own settlements" ON public.debt_settlements;
CREATE POLICY "Users can insert own settlements"
  ON public.debt_settlements FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.debts d WHERE d.id = debt_id AND d.user_id = auth.uid())
  );
REVOKE INSERT ON public.debt_settlements FROM anon, authenticated;
GRANT INSERT (debt_id, user_id, amount_settled, settled_at, note)
  ON public.debt_settlements TO authenticated;

-- AI scan assessments are server-written; users may still save and clear their own scans.
REVOKE UPDATE ON public.payshield_scans FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.payshield_scans TO authenticated;
GRANT SELECT, UPDATE ON public.payshield_scans TO service_role;

-- 6) Keep account/data-deletion operations behind authenticated Edge Functions.
REVOKE ALL ON FUNCTION public.delete_my_account_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_my_financial_data() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_user_financial_data(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'A user ID is required.'; END IF;

  DELETE FROM public.debt_settlements WHERE user_id = _user_id;
  DELETE FROM public.debts WHERE user_id = _user_id;
  DELETE FROM public.transactions WHERE user_id = _user_id;
  DELETE FROM public.budgets WHERE user_id = _user_id;
  DELETE FROM public.monthly_balances WHERE user_id = _user_id;
  DELETE FROM public.uploaded_imports WHERE user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_financial_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_financial_data(UUID) TO service_role;

-- 7) Server-side per-user daily limits for paid external processing.
CREATE TABLE IF NOT EXISTS public.user_daily_function_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  function_name TEXT NOT NULL CHECK (function_name IN ('payshield_ai', 'statement_parse')),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, usage_date, function_name)
);
ALTER TABLE public.user_daily_function_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_daily_function_usage FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_user_daily_quota(_function_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _limit INTEGER;
  _count INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;
  IF public.is_user_blocked() THEN RAISE EXCEPTION 'Account is temporarily blocked.' USING ERRCODE = '42501'; END IF;

  _limit := CASE _function_name
    WHEN 'payshield_ai' THEN 10
    WHEN 'statement_parse' THEN 10
    ELSE NULL
  END;
  IF _limit IS NULL THEN RAISE EXCEPTION 'Unknown quota category.' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.user_daily_function_usage (user_id, usage_date, function_name, request_count)
  VALUES (_uid, CURRENT_DATE, _function_name, 1)
  ON CONFLICT (user_id, usage_date, function_name)
  DO UPDATE SET request_count = public.user_daily_function_usage.request_count + 1
    WHERE public.user_daily_function_usage.request_count < _limit
  RETURNING request_count INTO _count;

  RETURN _count IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_user_daily_quota(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_user_daily_quota(TEXT) TO authenticated;

-- Full account cleanup remains server-only. The Auth user is deleted only after this
-- function succeeds, so a partial cleanup never silently signs the user out.
CREATE OR REPLACE FUNCTION public.delete_user_account_data(_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.chat_messages WHERE sender_id = _user_id;
  DELETE FROM public.conversations WHERE user_a = _user_id OR user_b = _user_id;
  DELETE FROM public.uploaded_imports WHERE user_id = _user_id;
  DELETE FROM public.friend_requests WHERE sender_id = _user_id OR receiver_id = _user_id;
  DELETE FROM public.group_settlements WHERE user_id = _user_id;
  DELETE FROM public.group_expense_splits WHERE user_id = _user_id;
  DELETE FROM public.group_expenses WHERE user_id = _user_id;
  DELETE FROM public.group_invites WHERE created_by = _user_id;
  DELETE FROM public.group_members WHERE user_id = _user_id OR member_user_id = _user_id;
  DELETE FROM public.groups WHERE user_id = _user_id;
  DELETE FROM public.debt_settlements WHERE user_id = _user_id;
  DELETE FROM public.debts WHERE user_id = _user_id;
  DELETE FROM public.transactions WHERE user_id = _user_id;
  DELETE FROM public.budgets WHERE user_id = _user_id;
  DELETE FROM public.monthly_balances WHERE user_id = _user_id;
  DELETE FROM public.payshield_scans WHERE user_id = _user_id;
  DELETE FROM public.push_subscriptions WHERE user_id = _user_id;
  DELETE FROM public.user_preferences WHERE user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_account_data(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account_data(UUID) TO service_role;

-- 8) An archived group remains readable, but deleting an Auth user must still
--    be able to cascade through historical rows. FK cascades run at nested
--    trigger depth; ordinary client DML still receives the archive guard.
CREATE OR REPLACE FUNCTION public.reject_archived_group_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _group_id UUID;
  _expense_id UUID;
BEGIN
  IF pg_trigger_depth() > 1 OR auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND public.is_user_blocked() THEN
    RAISE EXCEPTION 'Your account is temporarily blocked from making changes.' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'group_expense_splits' THEN
    _expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.expense_id ELSE NEW.expense_id END;
    IF TG_OP = 'UPDATE' AND OLD.expense_id IS DISTINCT FROM NEW.expense_id THEN
      RAISE EXCEPTION 'An expense allocation cannot be moved to another expense';
    END IF;
    SELECT e.group_id INTO _group_id FROM public.group_expenses e WHERE e.id = _expense_id;
  ELSE
    _group_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END;
    IF TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'A group record cannot be moved to another group';
    END IF;
  END IF;

  IF _group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = _group_id AND g.archived = true
  ) THEN
    RAISE EXCEPTION 'This group is archived. Unarchive it before making changes.' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- 9) RPC grants for helper functions used by other authenticated RPCs.
REVOKE ALL ON FUNCTION public.is_group_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_expense_group_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_expense_group_member(UUID) TO authenticated;

-- UPI lookup is a SECURITY DEFINER function; expose it only when the caller is
-- signed in and not blocked. Keep the existing transfer-matching query private.
ALTER FUNCTION public.get_group_payment_info(UUID) RENAME TO _get_group_payment_info_internal;
REVOKE ALL ON FUNCTION public._get_group_payment_info_internal(UUID) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_group_payment_info(_group_id UUID)
RETURNS TABLE (member_user_id UUID, display_name TEXT, upi_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_user_blocked() OR NOT public.is_group_member(_group_id) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT p.member_user_id, p.display_name, p.upi_id
  FROM public._get_group_payment_info_internal(_group_id) p;
END;
$$;
REVOKE ALL ON FUNCTION public.get_group_payment_info(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_payment_info(UUID) TO authenticated;

-- Keep grants deterministic even if earlier migrations had broad defaults.
GRANT USAGE ON SCHEMA public TO authenticated;
