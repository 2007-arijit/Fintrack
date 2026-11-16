import { test } from "node:test";
import { deepStrictEqual, ok, strictEqual, throws } from "node:assert/strict";
import {
  SplitError,
  allocateByWeights,
  computeAllocation,
  computeLedger,
  findUnreconciled,
  fromMinor,
  personWeight,
  remainingAfterSettlement,
  simplifyTransfers,
  toMinor,
  validateParticipant,
  type EngineParticipant,
  type LedgerExpense,
} from "../splitEngine";

const solo = (id: string): EngineParticipant => ({ id, mode: "solo", memberCount: 1 });
const family = (id: string, memberCount: number): EngineParticipant => ({ id, mode: "family", memberCount });

test("toMinor / fromMinor round-trip at the currency's precision", () => {
  strictEqual(toMinor(12.34, "INR"), 1234);
  strictEqual(toMinor("0.1", "INR"), 10);
  strictEqual(toMinor(100, "JPY"), 100); // zero-decimal currency
  strictEqual(fromMinor(1234, "INR"), 12.34);
  throws(() => toMinor("not a number"), SplitError);
});

test("validateParticipant enforces solo/family member counts", () => {
  strictEqual(validateParticipant({ mode: "solo", memberCount: 1 }), null);
  ok(validateParticipant({ mode: "solo", memberCount: 2 }));
  ok(validateParticipant({ mode: "family", memberCount: 1 }));
  ok(validateParticipant({ mode: "family", memberCount: 2.5 }));
  strictEqual(validateParticipant({ mode: "family", memberCount: 2 }), null);
  strictEqual(personWeight(family("f", 4)), 4);
  strictEqual(personWeight(solo("s")), 1);
});

test("allocateByWeights never loses or invents a minor unit", () => {
  deepStrictEqual(allocateByWeights(100, [1, 1, 1]), [34, 33, 33]); // tie broken by input order
  deepStrictEqual(allocateByWeights(100, [1, 1]), [50, 50]);
  for (const total of [1, 7, 100, 99999]) {
    for (const weights of [[1, 1, 1], [1, 2, 3], [33.33, 33.33, 33.34], [0, 1]]) {
      const shares = allocateByWeights(total, weights);
      strictEqual(
        shares.reduce((s, v) => s + v, 0),
        total,
        `total ${total} with weights ${weights}`
      );
    }
  }
});

test("allocateByWeights is deterministic and rejects nonsense input", () => {
  deepStrictEqual(allocateByWeights(101, [3, 1, 1]), allocateByWeights(101, [3, 1, 1]));
  throws(() => allocateByWeights(-1, [1]), SplitError);
  throws(() => allocateByWeights(10, []), SplitError);
  throws(() => allocateByWeights(10, [0, 0]), SplitError);
  throws(() => allocateByWeights(10, [1, -1]), SplitError);
});

test("per_person weights by people, per_family shares equally", () => {
  const participants = [solo("a"), family("b", 2), family("c", 3)];
  const perPerson = computeAllocation({
    mode: "per_person",
    totalMinor: 60000,
    participants,
    eligibleIds: ["a", "b", "c"],
  });
  deepStrictEqual(perPerson.allocations.map((a) => a.shareMinor), [10000, 20000, 30000]);

  const perFamily = computeAllocation({
    mode: "per_family",
    totalMinor: 60000,
    participants,
    eligibleIds: ["a", "b", "c"],
  });
  deepStrictEqual(perFamily.allocations.map((a) => a.shareMinor), [20000, 20000, 20000]);
});

test("selected and personal scope the allocation to the right participants", () => {
  const participants = [solo("a"), solo("b"), solo("c")];
  const selected = computeAllocation({
    mode: "selected",
    totalMinor: 1050,
    participants,
    eligibleIds: ["b", "c"],
  });
  deepStrictEqual(selected.allocations.map((a) => a.participantId), ["b", "c"]);
  strictEqual(selected.allocations.reduce((s, a) => s + a.shareMinor, 0), 1050);

  const personal = computeAllocation({ mode: "personal", totalMinor: 1050, participants, responsibleId: "b" });
  deepStrictEqual(personal.allocations, [
    { participantId: "b", shareMinor: 1050, weight: 1, memberCountAtTime: 1, modeAtTime: "solo" },
  ]);
  throws(() => computeAllocation({ mode: "personal", totalMinor: 1050, participants }), SplitError);
});

test("custom basis: amounts must reconcile, percentages must total 100", () => {
  const participants = [solo("a"), solo("b"), solo("c")];
  const byAmount = computeAllocation({
    mode: "custom",
    customBasis: "amount",
    totalMinor: 1000,
    participants,
    eligibleIds: ["a", "b", "c"],
    customValues: { a: 300, b: 300, c: 400 },
  });
  deepStrictEqual(byAmount.allocations.map((a) => a.shareMinor), [300, 300, 400]);

  throws(
    () =>
      computeAllocation({
        mode: "custom",
        customBasis: "amount",
        totalMinor: 1000,
        participants,
        eligibleIds: ["a", "b"],
        customValues: { a: 300, b: 300 },
      }),
    SplitError
  );

  const byPercentage = computeAllocation({
    mode: "custom",
    customBasis: "percentage",
    totalMinor: 10000,
    participants,
    eligibleIds: ["a", "b", "c"],
    customValues: { a: 33.33, b: 33.33, c: 33.34 },
  });
  strictEqual(byPercentage.allocations.reduce((s, a) => s + a.shareMinor, 0), 10000);
  strictEqual(byPercentage.customBasis, "percentage");

  throws(
    () =>
      computeAllocation({
        mode: "custom",
        customBasis: "percentage",
        totalMinor: 10000,
        participants,
        eligibleIds: ["a", "b"],
        customValues: { a: 50, b: 40 },
      }),
    SplitError
  );
});

test("allocation rejects unknown participants, empty splits and bad amounts", () => {
  const participants = [solo("a")];
  throws(() => computeAllocation({ mode: "per_family", totalMinor: 100, participants, eligibleIds: ["ghost"] }), SplitError);
  throws(() => computeAllocation({ mode: "per_family", totalMinor: 100, participants, eligibleIds: [] }), SplitError);
  throws(() => computeAllocation({ mode: "per_family", totalMinor: 0, participants, eligibleIds: ["a"] }), SplitError);
});

test("ledger: paid − share + settledOut − settledIn, and Σ net is zero", () => {
  const expenses: LedgerExpense[] = [{ id: "e1", paidBy: "a", amountMinor: 1000 }];
  const result = computeLedger({
    participantIds: ["a", "b"],
    expenses,
    allocations: [
      { expenseId: "e1", participantId: "a", shareMinor: 500 },
      { expenseId: "e1", participantId: "b", shareMinor: 500 },
    ],
    settlements: [{ id: "s1", from: "b", to: "a", amountMinor: 200 }],
  });
  strictEqual(result.totalExpensesMinor, 1000);
  deepStrictEqual(result.balances.a, { paidMinor: 1000, shareMinor: 500, settledOutMinor: 0, settledInMinor: 200, netMinor: 300 });
  deepStrictEqual(result.balances.b, { paidMinor: 0, shareMinor: 500, settledOutMinor: 200, settledInMinor: 0, netMinor: -300 });
  strictEqual(result.imbalanceMinor, 0);
});

test("ledger dedupes rows delivered twice and ignores deleted records", () => {
  const result = computeLedger({
    participantIds: ["a", "b"],
    expenses: [
      { id: "e1", paidBy: "a", amountMinor: 1000 },
      { id: "e1", paidBy: "a", amountMinor: 1000 }, // realtime + query duplicate
      { id: "e2", paidBy: "a", amountMinor: 500, deleted: true },
    ],
    allocations: [
      { expenseId: "e1", participantId: "b", shareMinor: 1000 },
      { expenseId: "e1", participantId: "b", shareMinor: 1000 },
      { expenseId: "e2", participantId: "b", shareMinor: 500 }, // deleted expense
    ],
    settlements: [{ id: "s1", from: "b", to: "a", amountMinor: 100, deleted: true }],
  });
  strictEqual(result.totalExpensesMinor, 1000);
  strictEqual(result.balances.b.shareMinor, 1000);
  strictEqual(result.balances.a.settledInMinor, 0);
  strictEqual(result.imbalanceMinor, 0);
});

test("findUnreconciled flags only active expenses whose splits miss the amount", () => {
  const expenses: LedgerExpense[] = [
    { id: "ok", paidBy: "a", amountMinor: 1000 },
    { id: "bad", paidBy: "a", amountMinor: 1000 },
    { id: "gone", paidBy: "a", amountMinor: 1000, deleted: true },
  ];
  const allocations = [
    { expenseId: "ok", participantId: "a", shareMinor: 1000 },
    { expenseId: "bad", participantId: "a", shareMinor: 900 },
    { expenseId: "gone", participantId: "a", shareMinor: 1 },
  ];
  deepStrictEqual(findUnreconciled(expenses, allocations), ["bad"]);
});

test("simplifyTransfers clears every balance with a minimal plan", () => {
  const transfers = simplifyTransfers({ a: 300, b: -100, c: -200 });
  strictEqual(transfers.reduce((s, t) => s + t.amountMinor, 0), 300);
  const settled: Record<string, number> = { a: 300, b: -100, c: -200 };
  for (const t of transfers) {
    settled[t.from] += t.amountMinor;
    settled[t.to] -= t.amountMinor;
  }
  deepStrictEqual(settled, { a: 0, b: 0, c: 0 });
  deepStrictEqual(simplifyTransfers({ a: 0, b: 0 }), []);
});

test("remainingAfterSettlement never goes negative", () => {
  strictEqual(remainingAfterSettlement(1000, 400), 600);
  strictEqual(remainingAfterSettlement(1000, 1000), 0);
  strictEqual(remainingAfterSettlement(1000, 1500), 0);
});
