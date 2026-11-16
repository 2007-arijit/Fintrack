# FinTrack v2 — Setup Guide

This  covers everything you need to deploy in your **own** Supabase project
to activate: Smart Import (CSV/PDF/Image), permanent account deletion,
password-gated data wipe, the Friends redesign, Friend Requests, Chat, and
the CDN-based Avatar system. Nothing here touches your live app until you
run these steps yourself.

## 1. Run the new database migration

In the Supabase SQL Editor, run (in order, if you haven't already run 001–003):

```
supabase/migrations/004_avatars_chat_import_account.sql
```

This adds:
- `user_preferences.avatar_url`, `transactions.import_hash`
- `uploaded_imports`, `conversations`, `chat_messages` tables + RLS
- RPCs: `get_or_create_conversation`, `get_conversations`, `get_monthly_message_count`,
  `mark_conversation_read`, `get_total_unread_count`, `get_incoming_requests`,
  `get_outgoing_requests`, `remove_friend`, `delete_my_account_data`,
  `delete_my_financial_data`
- Updated `get_friends` / `search_users` to include `avatar_url`
- A trigger enforcing the 60-messages-per-chat-per-month limit

Realtime is enabled for `conversations` and `chat_messages` automatically
via `ALTER PUBLICATION supabase_realtime ADD TABLE ...` in the migration.

## 2. Deploy the two Edge Functions

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase functions deploy delete-account
supabase functions deploy parse-statement
```

These run with your project's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects automatically — no
manual secret needed for those three.

## 3. Add your OCR.Space API key

PDF/Image import falls back to [OCR.Space](https://ocr.space/ocrapi) when a
PDF has no extractable text layer (scanned statements) or when the upload
is a photo. Get a free key, then:

```bash
supabase secrets set OCR_SPACE_API_KEY=your_key_here
```

Without this secret, image imports will show a clear error message and CSV
import continues to work normally (it never touches this function).

## 4. What changed, at a glance

| Feature | Where |
|---|---|
| Smart Import (CSV/PDF/Image) | Transactions page → Import button → `SmartImportModal` |
| Avatars (CDN-only, no storage) | Settings → Change Avatar → `/settings/avatar` |
| Friends redesign | Settings → Friends panel → "View All Friends" / "Friend Requests" |
| Chat | Bottom nav "Chat" (replaces "Reports" on mobile only — Reports is still in the desktop sidebar and reachable at `/reports`) |
| Delete All Data (financial only, password-gated) | Settings → Data Management |
| Permanently Delete Account | Settings → Danger Zone |

## Notes & honest caveats

- **PDF parsing** uses a generic line-based parser tuned for the common
  "date · narration · debit/credit · balance" layout most Indian bank
  statements share (the migration's `parseStatementText` function). It is
  not a hand-tuned parser per bank — it works well on clean, text-based
  statements and via OCR on scans, but always show the preview step before
  import (which the modal does) so you can catch anything mis-parsed.
- **Dedup** is a fingerprint of `(date, type, amount, description)` per
  user, enforced both client-side (pre-insert check) and via a unique
  index in Postgres — re-importing the same statement is safe.
- **Typing indicators** use Supabase Realtime *broadcast* (ephemeral, not
  stored) so they don't create DB writes for every keystroke.

## Split engine / Group Audit (migration 008)

Run `supabase/migrations/008_split_engine_audit.sql` after 001–007. It is additive:
existing expenses/splits/settlements keep their amounts; legacy "equal" splits map to
`per_family` and unequal/percentage/shares map to `custom`.

* All group financial writes now go through RPCs (`save_group_expense`, `delete_group_expense`,
  `restore_group_expense`, `record_group_settlement`, `delete_group_settlement`,
  `update_group_participant`, `join_group_via_invite`). Direct INSERT/UPDATE/DELETE on
  `group_expenses`, `group_expense_splits`, `group_settlements` and `group_audit_events` is revoked.
* Reads use `get_group_ledger(group_id)` — one snapshot stamped with `groups.financial_version`.
* Rounding policy: largest-remainder on integer minor units, ties by participant order (`src/lib/splitEngine.ts`).
* Tests: `npm test` (engine + ledger-state logic). DB scenarios: `supabase/tests/008_split_audit_checks.sql`.
* Group removal is a reversible archive (migration 011), not a hard delete. Archived groups remain readable with their balances and audit history; group/member/financial mutations are blocked until the owner restores the group.

## Split isolation (009) and participant-only "Personal" expenses (010)

Run `009_split_isolation_block_guard.sql`, then `010_participant_expenses_block_guard.sql`.
* 009: Split rows are copied to `split_mirrored_transactions_archive`, removed from `transactions`, and a CHECK forbids new ones.
* 010: an expense ticked "Personal" stays a normal shared expense (all division modes, balances, settlements) but can only be
  read by the payer, whoever added it, and members allocated a share. RLS hides the expense, its splits and its audit events
  from everyone else. If you ran the earlier creator-only draft of 009, its rows are converted (paid + fully allocated to the
  creator, visible only to them) and the old table is dropped.


## Safe group archiving (011)

Run `supabase/migrations/011_group_archive_block_guard.sql` after migrations 001–010.
* Backfills missing `user_preferences` rows for accounts that existed before the signup trigger was installed.
* Removes authenticated group DELETE policies so the app cannot destroy a group's financial history.
* Keeps archived groups readable, but blocks inserts, updates, and deletes to group members, expenses, allocations, settlements, and invites until the group is restored.
* The active groups screen separates archived groups, and archived group detail pages are read-only.
