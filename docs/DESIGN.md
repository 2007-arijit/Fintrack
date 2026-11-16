# Design notes

## Direction
Dark-first navy and indigo, light mode kept. One typeface (Manrope) with tabular figures for amounts. Cards are flat surfaces with a hairline border (no blur). Colour meaning comes only from tokens: `success`, `warning`, `destructive`, `primary`. Risk is always shown with a label as well as colour.

## Tokens
All in `src/index.css` (`:root` for light, `.dark` for dark). Change colours there, not in components.

## Motion rules
- Transform and opacity only.
- One reveal when a PayShield result arrives (`ps-reveal`), one progress bar while checking (`ps-scan-bar`), a 0.22 s fade between pages (`page-enter`).
- The network illustration pauses when scrolled out of view. It is decorative and does not show real payment traffic.
- `prefers-reduced-motion` switches all of it off (global rule at the end of `index.css`).

## Performance
- Pages are lazy-loaded (`src/App.tsx`); Dashboard, Auth and NotFound stay in the first load.
- Recharts loads only when a chart is shown.
- Stable vendor chunks for React, Supabase and Radix (`vite.config.ts`).
- Measured initial JavaScript: 1,537 kB (448 kB gzip) before, 895 kB (260 kB gzip) after.

## Not yet redesigned
Transactions, Budgets, Reports, Debt, Chat, Split and Settings only received the global changes (tokens, font, cards, buttons, sidebar). Their layouts are unchanged.
