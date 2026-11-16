-- ─── Username change cooldown + revert support ─────────────────
-- Usernames can only be changed once every 14 days. We track when the
-- username was last changed, and the immediately-previous username so the
-- user can revert to it (a revert is exempt from the 14-day cooldown, but
-- consumes the "previous username" slot so it can't be used to ping-pong
-- indefinitely).

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS username_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_username TEXT;

-- Backfill: treat any existing username as already "settled" (no cooldown)
UPDATE public.user_preferences
SET username_updated_at = created_at
WHERE username IS NOT NULL AND username_updated_at IS NULL;
