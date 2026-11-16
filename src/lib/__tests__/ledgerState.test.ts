import { test } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert/strict";
import {
  LedgerAccessError,
  acceptSnapshot,
  deriveAmountState,
  friendlyMutationError,
  ledgerFromSnapshot,
  parseLedgerSnapshot,
  type LedgerSnapshot,
} from "../ledgerState";

function snapshot(over: Partial<LedgerSnapshot> = {}): LedgerSnapshot {
  return {
    group_id: "g1",
    currency: "INR",
    version: 1,
    hidden_count: 0,
    expenses: [],
    splits: [],
    settlements: [],
    ...over,
  };
}

test("parseLedgerSnapshot refuses null, wrong-group and malformed payloads", () => {
  throws(() => parseLedgerSnapshot(null, "g1"), LedgerAccessError);
  throws(() => parseLedgerSnapshot(undefined, "g1"), LedgerAccessError);
  throws(() => parseLedgerSnapshot(snapshot({ group_id: "other" }), "g1"), /different group/);
  throws(() => parseLedgerSnapshot({ group_id: "g1", version: 1 }, "g1"), /Malformed/);
});

test("parseLedgerSnapshot defaults hidden_count and passes a valid snapshot through", () => {
  const raw = snapshot();
  delete (raw as { hidden_count?: number }).hidden_count;
  strictEqual(parseLedgerSnapshot(raw, "g1").hidden_count, 0);
  strictEqual(parseLedgerSnapshot(snapshot({ hidden_count: 3 }), "g1").hidden_count, 3);
});

test("acceptSnapshot keeps the newer version and never mixes groups", () => {
  const current = snapshot({ version: 2 });
  strictEqual(acceptSnapshot(current, snapshot({ version: 1 })), current);
  strictEqual(acceptSnapshot(current, snapshot({ version: 2 })).version, 2);
  strictEqual(acceptSnapshot(current, snapshot({ version: 3 })).version, 3);
  strictEqual(acceptSnapshot(current, snapshot({ group_id: "g2", version: 1 })).group_id, "g2");
  strictEqual(acceptSnapshot(undefined, current), current);
});

test("deriveAmountState walks loading → ready, and never shows another group's data", () => {
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: undefined, isError: false, isFetching: true, isInvalidated: false, pendingMutations: 0 }), "loading");
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: undefined, isError: true, isFetching: false, isInvalidated: false, pendingMutations: 0 }), "error");
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: snapshot({ group_id: "g2" }), isError: false, isFetching: false, isInvalidated: false, pendingMutations: 0 }), "loading");
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: snapshot(), isError: false, isFetching: false, isInvalidated: false, pendingMutations: 0 }), "ready");
  // a plain background refetch of a known-valid snapshot stays ready
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: snapshot(), isError: false, isFetching: true, isInvalidated: false, pendingMutations: 0 }), "ready");
});

test("deriveAmountState hides stale numbers while a mutation or refetch is in flight", () => {
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: snapshot(), isError: false, isFetching: false, isInvalidated: false, pendingMutations: 1 }), "invalidated");
  strictEqual(deriveAmountState({ wantedGroupId: "g1", data: snapshot(), isError: false, isFetching: true, isInvalidated: true, pendingMutations: 0 }), "invalidated");
});

test("ledgerFromSnapshot converts to minor units and reconciles the ledger", () => {
  const snap = snapshot({
    expenses: [
      {
        id: "e1",
        group_id: "g1",
        user_id: "u1",
        description: "Dinner",
        amount: 10.5,
        category: "food",
        paid_by: "m1",
        division_mode: "per_family",
        custom_basis: null,
        visibility: "group",
        split_type: "equal",
        expense_date: "2026-01-01",
        notes: null,
        version: 1,
        deleted_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    splits: [
      { id: "sp1", expense_id: "e1", member_id: "m1", share_amount: 10.5, share_units: 1, weight: 1, mode_at_time: "solo", member_count_at_time: 1 },
    ],
  });
  const ledger = ledgerFromSnapshot(snap, ["m1"]);
  strictEqual(ledger.totalExpensesMinor, 1050);
  strictEqual(ledger.balances.m1.netMinor, 0);
  strictEqual(ledger.imbalanceMinor, 0);
  deepStrictEqual(ledger.unreconciled, []);
});

test("ledgerFromSnapshot honours zero-decimal currencies and reports unreconciled expenses", () => {
  const base = snapshot({ currency: "JPY" });
  const expense = {
    id: "e1",
    group_id: "g1",
    user_id: "u1",
    description: "Lunch",
    amount: 100,
    category: "food",
    paid_by: "m1",
    division_mode: "selected",
    custom_basis: null,
    visibility: "group",
    split_type: "equal",
    expense_date: "2026-01-01",
    notes: null,
    version: 1,
    deleted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as const;

  const ok = ledgerFromSnapshot(
    { ...base, expenses: [expense], splits: [{ id: "sp1", expense_id: "e1", member_id: "m1", share_amount: 100, share_units: null, weight: 1, mode_at_time: null, member_count_at_time: null }] },
    ["m1"]
  );
  strictEqual(ok.totalExpensesMinor, 100);

  const broken = ledgerFromSnapshot(
    { ...base, expenses: [expense], splits: [{ id: "sp1", expense_id: "e1", member_id: "m1", share_amount: 40, share_units: null, weight: 1, mode_at_time: null, member_count_at_time: null }] },
    ["m1"]
  );
  deepStrictEqual(broken.unreconciled, ["e1"]);
});

test("friendlyMutationError translates the RPC conflict codes", () => {
  strictEqual(friendlyMutationError("CONFLICT: version 4"), "Someone else changed this just now. The latest version has been loaded — review it and try again.");
  strictEqual(friendlyMutationError("STALE_PARTICIPANTS"), "Participant details changed. The split was refreshed — please check it and save again.");
  strictEqual(friendlyMutationError("Amount must be greater than zero"), "Amount must be greater than zero");
});
