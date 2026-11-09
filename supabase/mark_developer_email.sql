-- ============================================================
-- Grant developer/admin dashboard access to a specific account.
--
-- Run this manually in the Supabase SQL Editor, AFTER
-- 007_admin_push_notifications.sql has been applied.
--
-- Replace 'YOUR_EMAIL_HERE' with the exact email address of the
-- account (must already exist — sign up first, then run this).
-- You can run this again for additional developer accounts, and
-- run it with `is_developer = false` to revoke access.
-- ============================================================

BEGIN;

-- Required: this is what lets the UPDATE below actually take effect —
-- is_developer is normally locked down by a trigger so users can never
-- promote themselves through the app.
SELECT set_config('app.bypass_privilege_check', 'true', true);

UPDATE public.user_preferences
SET is_developer = true
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE');

COMMIT;

-- Verify it worked:
SELECT au.email, up.is_developer
FROM public.user_preferences up
JOIN auth.users au ON au.id = up.user_id
WHERE au.email = 'YOUR_EMAIL_HERE';
