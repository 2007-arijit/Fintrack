# FinTrack audit and repair notes — v3

This update applies a focused security, integrity, and reliability hardening pass to the supplied archive.

## Source changes

1. **Database migration 013** (`supabase/migrations/013_security_and_data_integrity_hardening.sql`)
   - Removes direct authenticated group hard-delete access.
   - Moves username cooldown/revert enforcement into PostgreSQL and locks metadata fields from client edits.
   - Restores sender cancellation of pending friend requests while restricting mutable columns.
   - Restricts chat writes to message inserts; message deletes/soft-deletes and read receipts now use checked RPCs.
   - Enforces current-friend and participant checks in conversation functions, prevents username wildcard enumeration, and hides currently blocked profiles in social lookups.
   - Tightens group invite, debt-settlement, and PayShield table grants.
   - Revokes authenticated execution of legacy account-wipe RPCs and exposes replacement cleanup only to the service role.
   - Adds server-side daily quotas for PayShield AI and statement parsing.
   - Allows trusted service-side account cleanup to pass the archived-group mutation guard.

2. **Frontend alignment**
   - Chat deletion uses `delete_chat_message`; conversation state resets on friend changes and handles RPC failures.
   - Username updates no longer submit client-controlled cooldown metadata.
   - Currency preferences reset on sign-out/user switch and ignore late responses from stale requests.
   - Supabase client configuration fails early with a clear environment error.
   - Smart Import enforces 8 MB and 10,000-row CSV limits client-side and validates actual calendar dates.
   - Destructive dialogs now require password re-authentication and send the password only to the server-side Edge Function.

3. **Edge Functions**
   - `parse-statement`: 8 MB file limit with a streaming request-body cap (including chunked requests), file signature checks, 3-page PDF ceiling, PNG/JPEG validation, line-aware PDF extraction, real calendar date validation, ISO-date-safe amount extraction, external OCR timeout, and daily quota.
   - `payshield-analyze`: request bounds, daily quota, sanitized local findings, stronger untrusted-input framing, bounded model output/timeout, robust model-output parsing, and service-role-only persistence.
   - `delete-account`: isolated password re-authentication, service-side data cleanup, then Auth user deletion.
   - `delete-financial-data`: new password-gated Edge Function using the service-only cleanup RPC.
   - `send-push`: strict audience/recipient/length validation, bounded delivery concurrency, and push-endpoint host allowlisting to avoid server-side requests to untrusted URLs.

4. **Documentation and packaging**
   - README and setup docs now cover migrations 001–013 and all Edge Functions/secrets.
   - `.env.example` contains only browser-safe public settings. Local Supabase metadata and environment files are ignored.

## Deployment sequence

1. Back up your Supabase database.
2. Apply migration 013 after migrations 001–012 (do not re-run earlier migrations).
3. Set required optional Edge Function secrets for the features you enable.
4. Deploy all five Edge Functions listed in `docs/SETUP_V2.md`.
5. Set the two public Vite variables in Vercel and redeploy.
6. Run the smoke tests in `docs/SETUP_V2.md` with test accounts before production use.

## Verification limits

- All 35 existing Node tests passed using Node 22's TypeScript stripping with a temporary extension resolver. The repository's normal `npm test` script could not be invoked because its `tsx` dependency is not installed in this environment.
- All 170 TypeScript/TSX implementation files (frontend and Edge Functions) passed TypeScript transpilation with zero syntax diagnostics. This is a syntax check, not a full semantic type-check.
- A complete dependency install could not be performed: `npm ci --offline` stopped because the required `zod` package was not cached, and the npm registry was unreachable. Therefore Vite build, ESLint, and full `tsc` checks remain unverified.
- No Deno or PostgreSQL/Supabase CLI runtime is installed here. The migration was reviewed statically, but it was **not executed against your Supabase database**, and the Edge Functions were not deployed or integration-tested. Run the staging migration and smoke tests before production use.
- The generic statement parser is heuristic and cannot guarantee accurate extraction from all bank PDF/image layouts; always check the preview before importing.

---

# v4 — blank white page fix

**Root cause:** `src/integrations/supabase/client.ts` threw an `Error` at module load whenever
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` were missing (no `.env` shipped; Vercel build without variables).
Because it ran before React mounted, nothing rendered and the page was blank.

**Changes**
1. `client.ts` no longer throws; it exports `supabaseConfigError` and uses safe placeholders.
2. `main.tsx` shows a clear setup screen (`ConfigMissing`) when configuration is missing, and wraps the whole app
   in an `ErrorBoundary` so a crash in any provider shows a message instead of a blank page.
3. `vite.config.ts`: removed `manualChunks` (react/recharts/supabase/query), a known source of circular-chunk
   runtime failures. Route-level `React.lazy` splitting is unchanged.
4. Service worker registers only in production builds (and is unregistered in dev) to avoid stale-file blank pages.
5. `tailwind.config.ts`: replaced `require()` with an ES import (the project is `"type": "module"`).
6. `localStorage` reads/writes in banners and push prompt go through `lib/safeStorage.ts` so blocked storage cannot crash rendering.

**To run:** `cp .env.example .env`, fill both variables, `npm install`, `npm run dev`.
