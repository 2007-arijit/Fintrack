# UI redesign notes

## Verify first (not run when this was written)
The redesign was written without `node_modules` or network access, so it was **never built or type-checked**. Only a syntax pass and an import-resolution check were done. Run:

```bash
npm install
npx tsc -p tsconfig.app.json --noEmit
npm run build
npm run lint
npm test
```
Known failures that existed before this work are listed in `docs/PAYSHIELD.md` (SettleUpModal, usePushNotifications, two unit tests).

## Measuring performance (nothing here is measured yet)
Compare against the original zip. In both, run `npm run build` and record the chunk table Vite prints.
Then `npm run preview` and use Chrome DevTools, Lighthouse (mobile) and the Performance panel on `/`, `/payshield`, `/transactions`.
Expected, not confirmed: the main chunk shrinks because pages are `React.lazy` and `recharts`, React, Supabase and React Query are split into vendor chunks.

## What changed
- Tokens: navy dark theme (default), light theme, teal accent, chart colours as CSS variables (`src/index.css`, `tailwind.config.ts`). Fonts: Manrope (headings) and Inter (body).
- `glass-card` is now an alias of `.surface` (flat, bordered, no blur). Prefer `.surface` in new code.
- `--accent` is now a subtle tint (it used to equal the primary colour). This changes menu and ghost-button hover.
- Pinch-zoom re-enabled in `index.html`.
- Components: Button `loading`, Badge variants, Input `aria-invalid`, `StatusBadge`, `ErrorState`, `PageHeader`, `CategoryIcon`/`CategoryLabel`/`PaymentLabel` (Lucide, replaces emoji for categories and payment methods).
- Dashboard: greeting, balance hero, PayShield card (latest real scan), stat cards, quick actions, charts with text summaries, recent activity, error state when transactions fail to load.
- PayShield: hero, tabbed scanner with validation hints, explicit AI state (off / ok / failed / needs_save), validated AI response, history with loading/error/empty/filter/refresh, safe "Clear" (reports failure instead of pretending).
- Network illustration (`NetworkMap.tsx`): SVG, decorative only. Pauses off-screen and when the tab is hidden; removed under reduced motion.
- Navigation: active indicator in the sidebar; mobile bottom nav now includes PayShield and a "More" sheet; floating add button no longer overlays dialogs.
- Performance: route-level `React.lazy` with the Suspense boundary inside `AppLayout`; `manualChunks` in `vite.config.ts`.

## Known limits
- `payshield_scans` stores `ai_used` only, so an AI failure is shown for the current scan but cannot be shown in saved history (no schema change was made).
- Transactions have no status field, so no status badges were added.
- Emoji remain for split-group types (`CreateGroupModal`, `GroupCard`).
- Pages other than Dashboard, PayShield and Transactions/Reports/Budgets cards inherit the new tokens but were not individually redesigned. Some still use `animate-fade-in` on cards.
- No visual or responsive testing was possible. Check 360px, 768px and desktop widths, both themes.
- Backup files (`*.backup`, `PayShield.local-backup.tsx`) were left in `src`.

## Final pass (fixes only)
- `SettleUpModal.tsx`: removed a call to the undefined `setRecordAsTransaction`, which threw a ReferenceError whenever the settle-up dialog opened.
- `pushConfig.ts`: `urlBase64ToUint8Array` now returns `Uint8Array<ArrayBuffer>`, fixing the `applicationServerKey` type error under `tsc`.
- Deleted `PayShield.local-backup.tsx`, `App.tsx.backup` and `AppSidebar.tsx.backup`. The `.tsx` backup sat inside `src` and was type-checked and linted with the app.
- Checked without a compiler: all files parse, all `@/` imports resolve, every custom CSS class and token used by the new components is defined.
- Tests: all 35 pass (`splitEngine`, `ledgerState`, `splitIsolation`). Three assertions pointed at old migration file names / an old nav pattern; updated them to the current files after confirming the migrations still enforce the same rules (block-guard, audience-only reads, audit rows carry the audience). `docs/REPAIR_NOTES.md` and `SETUP_V2.md` migration names corrected.
- Still not done (no network in the build environment): `npm install`, `tsc`, `npm run build`, bundle measurements, visual checks.
