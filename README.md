# FinTrack — Personal Finance & PayShield

FinTrack is a responsive personal-finance and social expense-tracking PWA built with React, TypeScript, Vite, and Supabase. It includes transaction tracking, budgets, debts, shared expense groups, friends/chat, CSV/PDF/image imports, PayShield risk analysis, and web push notifications.

## Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **State/data:** TanStack Query, Supabase JS
- **Backend:** Supabase PostgreSQL, Auth, RLS, Realtime, Edge Functions
- **Hosting:** Vercel (frontend) + Supabase (database/functions)

## Local setup

1. Install Node.js 18+ (Node 20+ recommended).
2. Install dependencies: `npm ci`.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Run the app: `npm run dev`.
5. Before shipping, run `npm test`, `npm run lint`, and `npm run build`.

The frontend only needs the Supabase project URL and anon/publishable key. **Never put a Supabase service-role key or third-party secret in a `VITE_` variable.**

## Database setup and upgrades

For a brand-new Supabase project, apply every SQL migration in `supabase/migrations/` in numeric order (`001` through `013`). Apply one file at a time in the Supabase SQL Editor or use the Supabase CLI migration workflow.

For an existing project, first compare the database's applied migrations with the files already deployed. Do not rerun migrations that have already been applied. This update adds `013_security_and_data_integrity_hardening.sql`; apply it **after 001–012**. Back up the database before applying production schema changes, and test the migration on a staging project first.

After applying migrations, confirm that the SQL Editor reports success and that the new RPCs are present. The `013` migration tightens table/column grants, chat and friend access, account data deletion, username cooldown rules, and per-user daily processing quotas.

## Edge Functions

Deploy the functions from the project root after linking the Supabase project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy parse-statement
supabase functions deploy payshield-analyze
supabase functions deploy delete-account
supabase functions deploy delete-financial-data
supabase functions deploy send-push
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Keep the service-role key server-side only.

Optional secrets, depending on which features you use:

```bash
supabase secrets set OCR_SPACE_API_KEY=YOUR_OCR_SPACE_KEY
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
supabase secrets set VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
supabase secrets set VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
```

- `OCR_SPACE_API_KEY`: PDF OCR fallback and scanned image imports.
- `GEMINI_API_KEY`: optional PayShield AI review; rule-based scanning remains available without it.
- VAPID secrets: web push notifications; the public key in Supabase must match `src/lib/pushConfig.ts`.

## Security and data notes

- RLS remains the primary data-access boundary. The application also uses checked `SECURITY DEFINER` RPCs for operations that must cross RLS safely.
- Chat message updates/deletes are now server-controlled; clients cannot mutate another sender's message or forge message timestamps.
- Username changes are enforced by a database trigger, including the 14-day cooldown and one-time revert.
- PDF/image imports are limited to 8 MB and three PDF pages; CSV imports are limited to 8 MB and 10,000 rows. External parsing/AI calls have server-side daily quotas.
- Account deletion and financial-data clearing require password re-authentication in an isolated Auth client. Service-role keys never reach the browser.
- PayShield AI analyzes user-submitted text as untrusted content. Its result is advisory and must not be treated as proof that a payment, sender, URL, or UPI ID is safe.

## Project structure

- `src/components/`, `src/pages/`: UI and routes
- `src/hooks/`, `src/contexts/`: client-side state and data access
- `src/lib/`: finance, split, currency, and PayShield logic
- `src/integrations/supabase/`: typed Supabase client
- `supabase/migrations/`: ordered PostgreSQL migrations
- `supabase/functions/`: server-side Edge Functions
- `supabase/tests/`: SQL scenario checks
- `docs/`: deployment and repair notes

## Important deployment caveat

This ZIP is source code, not a deployed application. Migrations and Edge Functions must be applied/deployed to your own Supabase project, and Vercel must be configured with the two public Vite environment variables. Password verification for destructive actions currently uses email/password Auth; OAuth-only users need a password credential before using these actions.

## License

MIT
