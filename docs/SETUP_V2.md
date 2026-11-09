# FinTrack deployment and upgrade guide

This guide matches the current source tree (migrations 001–013).

## 1. Database

For a new project, run every file in `supabase/migrations/` in numeric order. For an existing project, do not replay migrations already applied. Back up the database, compare its state with your migration history, then apply migration `013_security_and_data_integrity_hardening.sql` after 001–012.

Migration 013 includes:
- Server-enforced username cooldown and previous-name revert.
- Restricted profile, friend-request, invite, settlement, PayShield, chat, and group grants.
- Conversation/friendship checks and sender-only message deletion.
- Service-role-only account and financial-data cleanup RPCs.
- Per-user daily quotas for statement parsing and PayShield AI.
- Archived-group trigger handling for authorized account cleanup.

## 2. Frontend environment

Copy `.env.example` to `.env.local` and provide:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Only the public anon/publishable key belongs in the browser. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OCR_SPACE_API_KEY`, or `VAPID_PRIVATE_KEY` via a `VITE_` variable.

## 3. Edge Functions

From the repository root:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy parse-statement
supabase functions deploy payshield-analyze
supabase functions deploy delete-account
supabase functions deploy delete-financial-data
supabase functions deploy send-push
```

The Supabase platform supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Configure optional secrets only for features you use:

```bash
supabase secrets set OCR_SPACE_API_KEY=YOUR_OCR_SPACE_KEY
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
supabase secrets set VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
supabase secrets set VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```

## 4. Limits and safeguards

- CSV: 8 MB maximum, 10,000 rows maximum.
- PDF/image: 8 MB maximum; PDF text/OCR path is limited to 3 pages.
- Statement parsing: 10 requests per user per UTC day.
- PayShield AI: 10 requests per user per UTC day.
- Password-gated financial clearing/account deletion currently re-authenticate email/password credentials. OAuth-only accounts need to set a password first.

The generic statement parser is heuristic. Always review the import preview before inserting transactions; OCR and bank-statement layouts can produce incorrect descriptions or amounts.

## 5. Local checks and Vercel

```bash
npm ci
npm test
npm run lint
npm run build
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel Project Settings → Environment Variables, then redeploy. Vercel serves the frontend only; Supabase migrations and Edge Functions are deployed separately.

## 6. Post-deploy smoke tests

Use test accounts and non-production data to verify:
1. Sign-up/sign-in, dashboard, transaction CRUD, CSV import and duplicate detection.
2. Friend request send/accept/cancel, search, and removal.
3. Chat send/read/delete, monthly limit, and access removal after unfriend.
4. Split group create/join/expense/settlement/archive/restore.
5. PayShield rule scan, AI opt-in, and stored report update.
6. PDF/image import with OCR configured, including oversized and multi-page rejection.
7. Financial data clearing and full account deletion with an incorrect and then correct password.
8. Push delivery from a developer account, with both all-user and selected recipients.
