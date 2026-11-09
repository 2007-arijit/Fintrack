-- FinTrack PayShield: private scan history
-- Apply after the existing FinTrack migrations (001–011).

CREATE TABLE IF NOT EXISTS public.payshield_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  input_kind TEXT NOT NULL CHECK (input_kind IN ('message', 'url', 'upi')),
  input_preview TEXT NOT NULL DEFAULT '' CHECK (char_length(input_preview) <= 120),
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 10),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  ai_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payshield_scans_user_created_idx
  ON public.payshield_scans (user_id, created_at DESC);

ALTER TABLE public.payshield_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own PayShield scans" ON public.payshield_scans;
CREATE POLICY "Users can read their own PayShield scans"
  ON public.payshield_scans FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create their own PayShield scans" ON public.payshield_scans;
CREATE POLICY "Users can create their own PayShield scans"
  ON public.payshield_scans FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own PayShield scans" ON public.payshield_scans;
CREATE POLICY "Users can update their own PayShield scans"
  ON public.payshield_scans FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own PayShield scans" ON public.payshield_scans;
CREATE POLICY "Users can delete their own PayShield scans"
  ON public.payshield_scans FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payshield_scans TO authenticated;
REVOKE ALL ON public.payshield_scans FROM anon;

-- Restrictive policy ensures a blocked account cannot use the table even
-- if another permissive policy is added later.
DROP POLICY IF EXISTS "Blocked accounts cannot use PayShield scans" ON public.payshield_scans;
CREATE POLICY "Blocked accounts cannot use PayShield scans"
  ON public.payshield_scans AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (NOT public.is_user_blocked())
  WITH CHECK (NOT public.is_user_blocked());
