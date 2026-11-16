# PayShield

Scam-check module inside FinTrack. Local rules run in the browser, an optional Gemini review runs in a Supabase Edge Function, and every scan is stored per user.

## Where things live
| Part | File |
|---|---|
| Page and rule engine | `src/pages/PayShield.tsx` |
| Score dial | `src/components/payshield/RiskGauge.tsx` |
| Network illustration (decorative SVG) | `src/components/visualizations/NetworkMap.tsx` |
| Dashboard PayShield card | `src/components/dashboard/PayShieldCard.tsx` |
| History chart | `src/components/payshield/ScanTrends.tsx` |
| Motion styles (`ps-reveal`, `ps-scan-bar`) | `src/index.css` |
| AI review function | `supabase/functions/payshield-analyze/index.ts` |
| Scan history table and RLS | `supabase/migrations/012_payshield_scan_history.sql` |
| Earlier local-only version (reference) | `src/pages/PayShield.local-backup.tsx` |

## Risk scoring
Each finding adds points: high 3, medium 2, note 0 (max 10). Score 0-1 is low, 2-4 is caution, 5 and above is high. The AI review can raise the rating but never lower it.

## Deploy the Edge Function (PowerShell, from the folder containing package.json)
```powershell
npx supabase functions deploy payshield-analyze
```
The key `GEMINI_API_KEY` is a Supabase secret. Never put it in `.env` or any `VITE_` variable.

## Changes in this version
- Rules added: debt or credit-report pressure, and web addresses written without `http` or `www`.
- Gemini model changed from `gemini-2.5-flash` to `gemini-3.8-flash` (the 2.5 model is closed to new users).
- Migration 012 copied into the migrations folder (safe to re-run).
- PayShield redesigned: dial for the score, per-finding severity rails, a "what to do next" section, history chart, confirmation before clearing history, keyboard focus styles, reduced-motion support.
- Notes moved from the project root into `docs/`.

## Known issues (not caused by PayShield)
- `src/components/groups/SettleUpModal.tsx` line 62 uses an undefined `setRecordAsTransaction`.
- `src/hooks/usePushNotifications.ts` has a TypeScript buffer type error.
- Two unit tests fail (`npm test`): split code vs `transactions`, and migration 010 audience restriction.
- `docs/REPAIR_NOTES.md` lists migration file names that no longer match the folder.
