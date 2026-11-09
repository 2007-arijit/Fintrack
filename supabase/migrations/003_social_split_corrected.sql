-- ============================================================
-- FinTrack — Social Split: usernames, friends, invite links,
-- and membership-based access to shared groups.
-- Run this in your Supabase SQL Editor after 001 and 002.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── usernames ───────────────────────────────────────────────
ALTER TABLE public.user_preferences
  ADD COLUMN username TEXT;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_username_format
  CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$');

CREATE UNIQUE INDEX user_preferences_username_unique
  ON public.user_preferences (username)
  WHERE username IS NOT NULL;

-- ─── friend_requests ─────────────────────────────────────────
CREATE TABLE public.friend_requests (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id),
  UNIQUE (sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can view requests" ON public.friend_requests
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send requests" ON public.friend_requests
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Only the receiver can accept or decline a pending request.
CREATE POLICY "Receiver can update requests" ON public.friend_requests
  FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- Prevent changing request participants or making invalid status transitions.
CREATE OR REPLACE FUNCTION public.protect_friend_request_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'Friend request participants cannot be changed';
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'Only the receiver can update a friend request';
  END IF;

  IF OLD.status <> 'pending'
     OR NEW.status NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid friend request status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_friend_request_update
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.protect_friend_request_update();

CREATE TRIGGER update_friend_requests_updated_at
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_friend_requests_receiver ON public.friend_requests (receiver_id, status);
CREATE INDEX idx_friend_requests_sender   ON public.friend_requests (sender_id, status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;

-- ─── group_members: link a chip to a real account ───────────
ALTER TABLE public.group_members
  ADD COLUMN member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_group_members_member_user ON public.group_members (member_user_id);

-- Prevent adding the same account to a group twice
CREATE UNIQUE INDEX group_members_group_member_unique
  ON public.group_members (group_id, member_user_id)
  WHERE member_user_id IS NOT NULL;

-- ─── group_invites ───────────────────────────────────────────
CREATE TABLE public.group_invites (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id   UUID        NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  code       TEXT        NOT NULL UNIQUE DEFAULT replace(encode(gen_random_bytes(8), 'base64'), '/', '_'),
  created_by UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_group_invites_group ON public.group_invites (group_id);

CREATE TRIGGER update_group_invites_updated_at
  BEFORE UPDATE ON public.group_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── membership helper functions (SECURITY DEFINER, bypass RLS) ──
CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = _group_id AND g.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups g WHERE g.id = _group_id AND g.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.group_members m WHERE m.group_id = _group_id AND m.member_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_expense_group_member(_expense_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_group_member(e.group_id) FROM public.group_expenses e WHERE e.id = _expense_id;
$$;

GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_expense_group_member(UUID) TO authenticated;

-- ─── RLS: groups (membership-based read, admin-only write) ───
DROP POLICY IF EXISTS "Users can view own groups"   ON public.groups;
DROP POLICY IF EXISTS "Users can insert own groups" ON public.groups;
DROP POLICY IF EXISTS "Users can update own groups" ON public.groups;
DROP POLICY IF EXISTS "Users can delete own groups" ON public.groups;

CREATE POLICY "Members can view groups" ON public.groups
  FOR SELECT USING (public.is_group_member(id));
CREATE POLICY "Users can create groups" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can update group" ON public.groups
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admin can delete group" ON public.groups
  FOR DELETE USING (auth.uid() = user_id);

-- ─── RLS: group_members (membership-based read, admin-only manage) ──
DROP POLICY IF EXISTS "Users can view own group members"   ON public.group_members;
DROP POLICY IF EXISTS "Users can insert own group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can update own group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can delete own group members" ON public.group_members;

CREATE POLICY "Members can view group members" ON public.group_members
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Admin can add group members" ON public.group_members
  FOR INSERT WITH CHECK (public.is_group_admin(group_id));
CREATE POLICY "Admin can update group members" ON public.group_members
  FOR UPDATE USING (public.is_group_admin(group_id));
CREATE POLICY "Admin can remove group members" ON public.group_members
  FOR DELETE USING (public.is_group_admin(group_id));

-- ─── RLS: group_expenses ─────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own group expenses"   ON public.group_expenses;
DROP POLICY IF EXISTS "Users can insert own group expenses" ON public.group_expenses;
DROP POLICY IF EXISTS "Users can update own group expenses" ON public.group_expenses;
DROP POLICY IF EXISTS "Users can delete own group expenses" ON public.group_expenses;

CREATE POLICY "Members can view group expenses" ON public.group_expenses
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Members can add group expenses" ON public.group_expenses
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND auth.uid() = user_id);
CREATE POLICY "Owner or admin can edit expense" ON public.group_expenses
  FOR UPDATE USING (auth.uid() = user_id OR public.is_group_admin(group_id));
CREATE POLICY "Owner or admin can delete expense" ON public.group_expenses
  FOR DELETE USING (auth.uid() = user_id OR public.is_group_admin(group_id));

-- ─── RLS: group_expense_splits ───────────────────────────────
DROP POLICY IF EXISTS "Users can view own splits"   ON public.group_expense_splits;
DROP POLICY IF EXISTS "Users can insert own splits" ON public.group_expense_splits;
DROP POLICY IF EXISTS "Users can update own splits" ON public.group_expense_splits;
DROP POLICY IF EXISTS "Users can delete own splits" ON public.group_expense_splits;

CREATE POLICY "Members can view splits" ON public.group_expense_splits
  FOR SELECT USING (public.is_expense_group_member(expense_id));
CREATE POLICY "Members can add splits" ON public.group_expense_splits
  FOR INSERT WITH CHECK (public.is_expense_group_member(expense_id) AND auth.uid() = user_id);
CREATE POLICY "Members can update splits" ON public.group_expense_splits
  FOR UPDATE USING (public.is_expense_group_member(expense_id));
CREATE POLICY "Members can delete splits" ON public.group_expense_splits
  FOR DELETE USING (public.is_expense_group_member(expense_id));

-- ─── RLS: group_settlements ───────────────────────────────────
DROP POLICY IF EXISTS "Users can view own group settlements"   ON public.group_settlements;
DROP POLICY IF EXISTS "Users can insert own group settlements" ON public.group_settlements;
DROP POLICY IF EXISTS "Users can delete own group settlements" ON public.group_settlements;

CREATE POLICY "Members can view settlements" ON public.group_settlements
  FOR SELECT USING (public.is_group_member(group_id));
CREATE POLICY "Members can add settlements" ON public.group_settlements
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND auth.uid() = user_id);
CREATE POLICY "Owner or admin can delete settlement" ON public.group_settlements
  FOR DELETE USING (auth.uid() = user_id OR public.is_group_admin(group_id));

-- ─── RLS: group_invites (admin-only; joiners go through the RPC below) ──
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view invites" ON public.group_invites
  FOR SELECT USING (public.is_group_admin(group_id));
CREATE POLICY "Admin can create invites" ON public.group_invites
  FOR INSERT WITH CHECK (public.is_group_admin(group_id) AND created_by = auth.uid());
CREATE POLICY "Admin can revoke invites" ON public.group_invites
  FOR UPDATE USING (public.is_group_admin(group_id));

-- ─── search + friends helper functions ───────────────────────
CREATE OR REPLACE FUNCTION public.search_users(_query TEXT)
RETURNS TABLE (user_id UUID, username TEXT, display_name TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT up.user_id, up.username, up.display_name
  FROM public.user_preferences up
  WHERE up.username IS NOT NULL
    AND up.username ILIKE '%' || _query || '%'
    AND up.user_id <> auth.uid()
  ORDER BY up.username
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_users(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (friend_id UUID, username TEXT, display_name TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT up.user_id, up.username, up.display_name
  FROM public.friend_requests fr
  JOIN public.user_preferences up
    ON up.user_id = CASE WHEN fr.sender_id = auth.uid() THEN fr.receiver_id ELSE fr.sender_id END
  WHERE fr.status = 'accepted'
    AND (fr.sender_id = auth.uid() OR fr.receiver_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;

-- ─── join a group via an invite link (bypasses admin-only INSERT policy) ──
CREATE OR REPLACE FUNCTION public.join_group_via_invite(_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite public.group_invites%ROWTYPE;
  _name TEXT;
  _existing UUID;
  _group_owner UUID;
  _colors TEXT[] := ARRAY[
    '#6366f1','#22c55e','#f59e0b','#ec4899',
    '#06b6d4','#a855f7','#ef4444','#84cc16'
  ];
  _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO _invite
  FROM public.group_invites
  WHERE code = _code AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invite link is invalid or has been revoked';
  END IF;

  SELECT user_id
  INTO _group_owner
  FROM public.groups
  WHERE id = _invite.group_id
  FOR UPDATE;

  IF NOT FOUND OR _group_owner IS DISTINCT FROM _invite.created_by THEN
    RAISE EXCEPTION 'This invitation is no longer valid';
  END IF;

  SELECT id
  INTO _existing
  FROM public.group_members
  WHERE group_id = _invite.group_id
    AND member_user_id = auth.uid();

  IF FOUND THEN
    RETURN _invite.group_id;
  END IF;

  IF _group_owner = auth.uid() THEN
    RETURN _invite.group_id;
  END IF;

  SELECT COALESCE(
    username,
    display_name,
    split_part(
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      '@',
      1
    )
  )
  INTO _name
  FROM public.user_preferences
  WHERE user_id = auth.uid();

  SELECT COUNT(*)
  INTO _count
  FROM public.group_members
  WHERE group_id = _invite.group_id;

  INSERT INTO public.group_members (
    group_id, user_id, member_user_id, name, is_you, color
  )
  VALUES (
    _invite.group_id,
    _invite.created_by,
    auth.uid(),
    COALESCE(_name, 'Member'),
    false,
    _colors[(_count % 8) + 1]
  );

  RETURN _invite.group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_group_via_invite(TEXT) TO authenticated;

-- ============================================================
-- Consolidated GRANTs — supersedes the earlier fix; covers every
-- table across 001 + 002 + 003, plus the new functions above.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.user_preferences,
  public.transactions,
  public.budgets,
  public.debts,
  public.debt_settlements,
  public.monthly_balances,
  public.groups,
  public.group_members,
  public.group_expenses,
  public.group_expense_splits,
  public.group_settlements,
  public.friend_requests,
  public.group_invites
TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
