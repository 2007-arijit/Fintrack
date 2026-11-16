# FinTrack repair notes — archive-preserving update

This copy contains a first repair batch focused on safe group archiving and migration setup.

## Changes included

1. `supabase/migrations/010_participant_expenses_block_guard.sql`
   - Removed the obsolete GRANT for the old 12-argument `save_group_expense` signature.
   - Kept the GRANT for the current 13-argument signature.

2. `supabase/migrations/011_group_archive_block_guard.sql`
   - Backfills missing `user_preferences` rows for accounts that predate the signup trigger.
   - Removes authenticated DELETE policies/privilege for `groups`, so normal app users cannot hard-delete a group.
   - Keeps archived groups readable and blocks member, expense, allocation, settlement, and invite mutations while archived.

3. Frontend archive experience
   - Replaces the nonexistent `delete_group` RPC call with an owner-only update to `groups.archived`.
   - Shows active and archived groups separately.
   - Adds Archive / Restore controls in Group Settings.
   - Makes archived group details read-only while preserving access to expenses, balances, and audit history.

4. Updated setup documentation to include migration 011 and describe archiving.

## Important deployment guidance

- Keep your original project and `.env` file as a backup.
- This ZIP intentionally does not include `.env`, `node_modules`, or generated build output.
- Copy your own `.env` into the root of the repaired project locally; never upload it.
- If this Supabase project is completely fresh and none of migrations 001–010 have been applied, run all migrations 001 through 011 in numeric order, one at a time.
- If any migrations have already been applied, do not rerun them blindly. Check the actual database state first; migrations that create existing tables or policies can fail if repeated.
- Do not delete or reset your existing Supabase project to apply this repair.

## Verification status

- Checked the edited TypeScript/TSX files with the TypeScript parser: no syntax diagnostics were reported. Full type-check/build was not completed because project dependencies were not installed; the ZIP does not include a lockfile and dependency installation did not complete in this environment.
- SQL migrations were reviewed statically but were not executed against your live Supabase database.
- This batch does not yet implement the separate former-member anonymization/unlinking flow. That remains a distinct repair because it must preserve historical participant IDs and allocations safely.
