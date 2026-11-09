-- ============================================================
-- FinTrack — Avatars, Chat, Smart Import dedup, Account deletion
-- Run this in your Supabase SQL Editor after 001, 002, and 003.
-- ============================================================

-- ─── avatars (no storage — just a URL to the alohe/avatars CDN) ──
ALTER TABLE public.user_preferences
  ADD COLUMN avatar_url TEXT;

-- ─── import dedup ────────────────────────────────────────────
-- A stable fingerprint of a transaction (user + date + type + amount +
-- description + source file) so the smart-import pipeline can safely
-- skip rows it has already inserted, even across separate uploads.
ALTER TABLE public.transactions
  ADD COLUMN import_hash TEXT;

CREATE UNIQUE INDEX transactions_import_hash_unique
  ON public.transactions (user_id, import_hash)
  WHERE import_hash IS NOT NULL;

-- ─── uploaded_imports (audit trail of every import batch) ────
CREATE TABLE public.uploaded_imports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name        TEXT        NOT NULL,
  source_type      TEXT        NOT NULL CHECK (source_type IN ('csv', 'pdf', 'image')),
  bank_detected    TEXT,
  rows_detected    INTEGER     NOT NULL DEFAULT 0,
  rows_imported    INTEGER     NOT NULL DEFAULT 0,
  rows_duplicate   INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.uploaded_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own imports"   ON public.uploaded_imports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own imports" ON public.uploaded_imports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own imports" ON public.uploaded_imports FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_uploaded_imports_user ON public.uploaded_imports (user_id, created_at DESC);

-- ─── friend RPCs: include avatar_url, add request lists + remove ──
DROP FUNCTION IF EXISTS public.get_friends();

CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (friend_id UUID, username TEXT, display_name TEXT, avatar_url TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT up.user_id, up.username, up.display_name, up.avatar_url
  FROM public.friend_requests fr
  JOIN public.user_preferences up
    ON up.user_id = CASE WHEN fr.sender_id = auth.uid() THEN fr.receiver_id ELSE fr.sender_id END
  WHERE fr.status = 'accepted'
    AND (fr.sender_id = auth.uid() OR fr.receiver_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_incoming_requests()
RETURNS TABLE (request_id UUID, user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT fr.id, up.user_id, up.username, up.display_name, up.avatar_url, fr.created_at
  FROM public.friend_requests fr
  JOIN public.user_preferences up ON up.user_id = fr.sender_id
  WHERE fr.receiver_id = auth.uid() AND fr.status = 'pending'
  ORDER BY fr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_incoming_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_outgoing_requests()
RETURNS TABLE (request_id UUID, user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT fr.id, up.user_id, up.username, up.display_name, up.avatar_url, fr.created_at
  FROM public.friend_requests fr
  JOIN public.user_preferences up ON up.user_id = fr.receiver_id
  WHERE fr.sender_id = auth.uid() AND fr.status = 'pending'
  ORDER BY fr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_outgoing_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_friend(_friend_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.friend_requests
  WHERE status = 'accepted'
    AND ((sender_id = auth.uid() AND receiver_id = _friend_id)
      OR (sender_id = _friend_id AND receiver_id = auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.search_users(TEXT);

CREATE OR REPLACE FUNCTION public.search_users(_query TEXT)
RETURNS TABLE (user_id UUID, username TEXT, display_name TEXT, avatar_url TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT up.user_id, up.username, up.display_name, up.avatar_url
  FROM public.user_preferences up
  WHERE up.username IS NOT NULL
    AND up.username ILIKE '%' || _query || '%'
    AND up.user_id <> auth.uid()
  ORDER BY up.username
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(TEXT) TO authenticated;

-- ============================================================
-- CHAT SYSTEM — one-to-one, friends-only, 60 msgs/month cap
-- ============================================================

-- ─── conversations ───────────────────────────────────────────
-- user_a is always the lexicographically smaller UUID so a given
-- pair of friends maps to exactly one conversation row.
CREATE TABLE public.conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_a <> user_b),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_conversations_user_a ON public.conversations (user_a, last_message_at DESC);
CREATE INDEX idx_conversations_user_b ON public.conversations (user_b, last_message_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- ─── chat_messages ───────────────────────────────────────────
CREATE TABLE public.chat_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content         TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  read_at         TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_chat_messages_conversation ON public.chat_messages (conversation_id, created_at DESC);
CREATE INDEX idx_chat_messages_sender_month ON public.chat_messages (sender_id, conversation_id, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- ─── friendship + participant helpers (SECURITY DEFINER) ─────
CREATE OR REPLACE FUNCTION public.are_friends(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friend_requests fr
    WHERE fr.status = 'accepted'
      AND ((fr.sender_id = _a AND fr.receiver_id = _b) OR (fr.sender_id = _b AND fr.receiver_id = _a))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  );
$$;

GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;

-- ─── RLS: conversations (participants only) ──────────────────
CREATE POLICY "Participants can view conversation" ON public.conversations
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Inserts only happen through get_or_create_conversation() below (SECURITY DEFINER),
-- but we still allow a direct insert as a fallback, gated on friendship.
CREATE POLICY "Friends can create conversation" ON public.conversations
  FOR INSERT WITH CHECK (
    (auth.uid() = user_a OR auth.uid() = user_b)
    AND public.are_friends(user_a, user_b)
  );

CREATE POLICY "Participants can update conversation" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ─── RLS: chat_messages (participants only, friends only) ────
CREATE POLICY "Participants can view messages" ON public.chat_messages
  FOR SELECT USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants can send messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND public.is_conversation_participant(conversation_id)
  );

CREATE POLICY "Sender can update own message" ON public.chat_messages
  FOR UPDATE USING (auth.uid() = sender_id OR public.is_conversation_participant(conversation_id));

CREATE POLICY "Sender can delete own message" ON public.chat_messages
  FOR DELETE USING (auth.uid() = sender_id);

-- ─── monthly limit: 60 messages per chat per sender per month ──
CREATE OR REPLACE FUNCTION public.enforce_chat_monthly_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INTEGER;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM public.chat_messages
  WHERE conversation_id = NEW.conversation_id
    AND sender_id = NEW.sender_id
    AND created_at >= date_trunc('month', now());

  IF _count >= 60 THEN
    RAISE EXCEPTION 'Monthly chat limit reached.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_chat_monthly_limit
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_chat_monthly_limit();

-- keep conversations.last_message_at fresh, for ordering the chat list
CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_conversation_last_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_last_message();

-- ─── RPCs used by the client ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_friend_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me   UUID := auth.uid();
  _a    UUID;
  _b    UUID;
  _id   UUID;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.are_friends(_me, _friend_id) THEN
    RAISE EXCEPTION 'You can only chat with friends.';
  END IF;

  IF _me < _friend_id THEN _a := _me; _b := _friend_id; ELSE _a := _friend_id; _b := _me; END IF;

  SELECT id INTO _id FROM public.conversations WHERE user_a = _a AND user_b = _b;
  IF FOUND THEN RETURN _id; END IF;

  INSERT INTO public.conversations (user_a, user_b) VALUES (_a, _b) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(UUID) TO authenticated;

-- Messages sent by me this month, in a given conversation — lets the UI
-- show "42 / 60 messages used" and disable the composer at the limit.
CREATE OR REPLACE FUNCTION public.get_monthly_message_count(_conversation_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.chat_messages
  WHERE conversation_id = _conversation_id
    AND sender_id = auth.uid()
    AND created_at >= date_trunc('month', now());
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_message_count(UUID) TO authenticated;

-- Mark every message from the other participant as read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.chat_messages
  SET read_at = now()
  WHERE conversation_id = _conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- Total unread messages across all of my conversations (for nav badge)
CREATE OR REPLACE FUNCTION public.get_total_unread_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.chat_messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE (c.user_a = auth.uid() OR c.user_b = auth.uid())
    AND m.sender_id <> auth.uid()
    AND m.read_at IS NULL
    AND m.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_total_unread_count() TO authenticated;

-- One row per conversation the caller is in, with the other participant's
-- profile, the last message preview, and how many are unread — everything
-- the Chat list screen needs in a single round trip.
CREATE OR REPLACE FUNCTION public.get_conversations()
RETURNS TABLE (
  conversation_id UUID,
  friend_id UUID,
  friend_username TEXT,
  friend_display_name TEXT,
  friend_avatar_url TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    up.user_id,
    up.username,
    up.display_name,
    up.avatar_url,
    (
      SELECT CASE WHEN m.deleted_at IS NULL THEN m.content ELSE 'Message deleted' END
      FROM public.chat_messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.created_at DESC
      LIMIT 1
    ),
    c.last_message_at,
    (
      SELECT COUNT(*)::INTEGER FROM public.chat_messages m
      WHERE m.conversation_id = c.id AND m.sender_id <> auth.uid() AND m.read_at IS NULL AND m.deleted_at IS NULL
    )
  FROM public.conversations c
  JOIN public.user_preferences up
    ON up.user_id = CASE WHEN c.user_a = auth.uid() THEN c.user_b ELSE c.user_a END
  WHERE c.user_a = auth.uid() OR c.user_b = auth.uid()
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversations() TO authenticated;

-- ============================================================
-- ACCOUNT DELETION
-- ============================================================
-- Wipes every row owned by the caller across every user-owned table.
-- Auth-user removal itself must happen via the Supabase Admin API
-- (service role), which only an Edge Function can hold — this RPC
-- handles the data half and is called by that function right before
-- it deletes the auth user.
CREATE OR REPLACE FUNCTION public.delete_my_account_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.chat_messages WHERE sender_id = _me;
  DELETE FROM public.conversations WHERE user_a = _me OR user_b = _me;
  DELETE FROM public.uploaded_imports WHERE user_id = _me;
  DELETE FROM public.friend_requests WHERE sender_id = _me OR receiver_id = _me;
  DELETE FROM public.group_settlements WHERE user_id = _me;
  DELETE FROM public.group_expense_splits WHERE user_id = _me;
  DELETE FROM public.group_expenses WHERE user_id = _me;
  DELETE FROM public.group_invites WHERE created_by = _me;
  DELETE FROM public.group_members WHERE user_id = _me OR member_user_id = _me;
  DELETE FROM public.groups WHERE user_id = _me;
  DELETE FROM public.debt_settlements WHERE user_id = _me;
  DELETE FROM public.debts WHERE user_id = _me;
  DELETE FROM public.transactions WHERE user_id = _me;
  DELETE FROM public.budgets WHERE user_id = _me;
  DELETE FROM public.monthly_balances WHERE user_id = _me;
  DELETE FROM public.user_preferences WHERE user_id = _me;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account_data() TO authenticated;

-- Deletes ONLY financial data (used by the password-gated "Delete All
-- Data" button in Settings). Keeps the account, profile, friends, and
-- chat intact — mirrors the scope of the existing Settings button but
-- centralizes it server-side instead of only clearing `transactions`
-- from the client.
CREATE OR REPLACE FUNCTION public.delete_my_financial_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.debt_settlements WHERE user_id = _me;
  DELETE FROM public.debts WHERE user_id = _me;
  DELETE FROM public.transactions WHERE user_id = _me;
  DELETE FROM public.budgets WHERE user_id = _me;
  DELETE FROM public.monthly_balances WHERE user_id = _me;
  DELETE FROM public.uploaded_imports WHERE user_id = _me;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_financial_data() TO authenticated;

-- ============================================================
-- GRANTs for the new tables
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.uploaded_imports,
  public.conversations,
  public.chat_messages
TO authenticated;
