# PayShield

PayShield is FinTrack's payment-safety checker. Local rules run in the browser. An optional Gemini review runs in a Supabase Edge Function after the user explicitly opts in, and saved scans are scoped to the signed-in user.

## Where things live

| Part | File |
|---|---|
| Scanner and review flow | `src/pages/PayShield.tsx` |
| Rule engine and scan types | `src/lib/payshieldEngine.ts` |
| Result view, history, network illustration | `src/components/payshield/ScanResultView.tsx`, `ScanHistory.tsx`, `NetworkMap.tsx` |
| History query and dashboard summary | `src/hooks/usePayShieldHistory.ts`, `src/hooks/usePayShieldSummary.ts` |
| Risk gauge and history chart | `src/components/payshield/RiskGauge.tsx`, `ScanTrends.tsx` |
| AI review endpoint | `supabase/functions/payshield-analyze/index.ts` |
| Scan history schema and RLS | `supabase/migrations/012_payshield_scan_history.sql` |
| AI quota and server-only update permissions | `supabase/migrations/013_security_and_data_integrity_hardening.sql` |

## Risk scoring and limitations

The rule engine produces a local risk score and findings. The optional AI review may add context or raise the risk rating, but it is not allowed to lower an existing rule-based warning. Neither system can confirm a person's identity, verify an account or UPI ID, query a bank's fraud systems, or guarantee that a payment is safe. Treat the result as a warning aid, not proof.

## Deploy

Apply migrations 001–013 in order on a new project. For an existing project, apply only migrations that have not already been run; migration 013 follows 001–012. Back up the database and verify the upgrade on a staging project first.

Deploy the function from the repository root:

```bash
supabase functions deploy payshield-analyze
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

Never put `GEMINI_API_KEY` in `.env`, a `VITE_` variable, or browser code. Daily AI review is limited to 10 requests per signed-in user. If AI is not configured or unavailable, rule-based scans remain usable.

## Privacy

The AI review sends the entered message, URL, or UPI text to Google's Gemini API only when the user opts in. The saved scan is checked for ownership before the server updates it. Do not enter passwords, OTPs, full card numbers, or other secrets into the scanner.
