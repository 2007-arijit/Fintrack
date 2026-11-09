import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAllocation, computeLedger, findUnreconciled, simplifyTransfers,
  toMinor, fromMinor, allocateByWeights, validateParticipant, SplitError,
  type EngineParticipant,
} from "../splitEngine.ts";

const A: EngineParticipant = { id: "A", mode: "family", memberCount: 3 };
const B: EngineParticipant = { id: "B", mode: "family", memberCount: 3 };
const C: EngineParticipant = { id: "C", mode: "family", memberCount: 2 };
const S: EngineParticipant = { id: "S", mode: "solo", memberCount: 1 };
const shares = (s: ReturnType<typeof computeAllocation>) => Object.fromEntries(s.allocations.map((a) => [a.participantId, a.shareMinor / 100]));

test("1. per person: 3/3/2 families split 8000", () => {
  const s = computeAllocation({ mode: "per_person", totalMinor: toMinor(8000), participants: [A, B, C], eligibleIds: ["A", "B", "C"] });
  assert.deepEqual(shares(s), { A: 3000, B: 3000, C: 2000 });
});
test("2. per family: same accounts split 9000 equally", () => {
  const s = computeAllocation({ mode: "per_family", totalMinor: toMinor(9000), participants: [A, B, C], eligibleIds: ["A", "B", "C"] });
  assert.deepEqual(shares(s), { A: 3000, B: 3000, C: 3000 });
});
test("3. solo joins families: weight 1 per person, 1 account per family mode", () => {
  const p = [A, B, C, S];
  const pp = computeAllocation({ mode: "per_person", totalMinor: toMinor(9000), participants: p, eligibleIds: ["A", "B", "C", "S"] });
  assert.deepEqual(shares(pp), { A: 3000, B: 3000, C: 2000, S: 1000 });
  const pf = computeAllocation({ mode: "per_family", totalMinor: toMinor(8000), participants: p, eligibleIds: ["A", "B", "C", "S"] });
  assert.deepEqual(shares(pf), { A: 2000, B: 2000, C: 2000, S: 2000 });
  // a solo account with a stale memberCount of 5 still weighs 1
  const bad: EngineParticipant = { id: "S", mode: "solo", memberCount: 5 };
  const x = computeAllocation({ mode: "per_person", totalMinor: 600, participants: [bad, { id: "T", mode: "solo", memberCount: 1 }], eligibleIds: ["S", "T"] });
  assert.deepEqual(x.allocations.map((a) => a.shareMinor), [300, 300]);
});
test("4a. custom exact amounts reconcile / reject mismatch", () => {
  const s = computeAllocation({ mode: "custom", customBasis: "amount", totalMinor: 10000, participants: [A, B], eligibleIds: ["A", "B"], customValues: { A: 3333, B: 6667 } });
  assert.equal(s.allocations.reduce((t, a) => t + a.shareMinor, 0), 10000);
  assert.throws(() => computeAllocation({ mode: "custom", customBasis: "amount", totalMinor: 10000, participants: [A, B], eligibleIds: ["A", "B"], customValues: { A: 3000, B: 6000 } }), SplitError);
});
test("4b. custom percentages reconcile; invalid pct rejected", () => {
  const s = computeAllocation({ mode: "custom", customBasis: "percentage", totalMinor: 10000, participants: [A, B, C], eligibleIds: ["A", "B", "C"], customValues: { A: 33.33, B: 33.33, C: 33.34 } });
  assert.equal(s.allocations.reduce((t, a) => t + a.shareMinor, 0), 10000);
  assert.throws(() => computeAllocation({ mode: "custom", customBasis: "percentage", totalMinor: 10000, participants: [A, B], eligibleIds: ["A", "B"], customValues: { A: 60, B: 60 } }), SplitError);
  assert.throws(() => computeAllocation({ mode: "custom", customBasis: "percentage", totalMinor: 10000, participants: [A, B], eligibleIds: ["A", "B"], customValues: { A: -10, B: 110 } }), SplitError);
});
test("4c. custom weights reconcile; zero/negative rejected", () => {
  const s = computeAllocation({ mode: "custom", customBasis: "weight", totalMinor: 10000, participants: [A, B, C], eligibleIds: ["A", "B", "C"], customValues: { A: 1, B: 2, C: 4 } });
  assert.equal(s.allocations.reduce((t, a) => t + a.shareMinor, 0), 10000);
  assert.throws(() => computeAllocation({ mode: "custom", customBasis: "weight", totalMinor: 100, participants: [A], eligibleIds: ["A"], customValues: { A: 0 } }), SplitError);
  assert.throws(() => computeAllocation({ mode: "custom", customBasis: "weight", totalMinor: 100, participants: [A, B], eligibleIds: ["A", "B"], customValues: { A: -1, B: 2 } }), SplitError);
});
test("5. selected excludes non-participants", () => {
  const s = computeAllocation({ mode: "selected", totalMinor: 9000, participants: [A, B, C], eligibleIds: ["A", "C"] });
  assert.deepEqual(shares(s), { A: 45, C: 45 });
  assert.equal(s.allocations.find((a) => a.participantId === "B"), undefined);
});
test("6. personal creates no debts for others", () => {
  const s = computeAllocation({ mode: "personal", totalMinor: 5000, participants: [A, B, C], responsibleId: "B" });
  assert.equal(s.allocations.length, 1);
  const l = computeLedger({
    participantIds: ["A", "B", "C"],
    expenses: [{ id: "e1", paidBy: "B", amountMinor: 5000 }],
    allocations: s.allocations.map((a) => ({ expenseId: "e1", participantId: a.participantId, shareMinor: a.shareMinor })),
    settlements: [],
  });
  assert.deepEqual([l.balances.A.netMinor, l.balances.B.netMinor, l.balances.C.netMinor], [0, 0, 0]);
});
test("7. rounding residuals: deterministic and exact", () => {
  const args = { mode: "per_family" as const, totalMinor: 1000, participants: [A, B, C], eligibleIds: ["A", "B", "C"] };
  const s1 = computeAllocation(args), s2 = computeAllocation(args);
  assert.deepEqual(s1, s2);
  assert.deepEqual(s1.allocations.map((a) => a.shareMinor), [334, 333, 333]);
  assert.deepEqual(allocateByWeights(1, [1, 1, 1]), [1, 0, 0]);
  assert.equal(toMinor(0.1 + 0.2), 30);
  assert.equal(toMinor("1.005"), 101);
  assert.equal(fromMinor(12345), 123.45);
  for (let t = 1; t < 300; t++) assert.equal(allocateByWeights(t, [3, 3, 2, 1, 7]).reduce((a, b) => a + b, 0), t);
});
test("8. partial and full settlements", () => {
  const alloc = [{ expenseId: "e", participantId: "A", shareMinor: 3000 }, { expenseId: "e", participantId: "B", shareMinor: 3000 }, { expenseId: "e", participantId: "C", shareMinor: 3000 }];
  const base = { participantIds: ["A", "B", "C"], expenses: [{ id: "e", paidBy: "A", amountMinor: 9000 }], allocations: alloc };
  const l0 = computeLedger({ ...base, settlements: [] });
  assert.equal(l0.balances.A.netMinor, 6000);
  const l1 = computeLedger({ ...base, settlements: [{ id: "s1", from: "B", to: "A", amountMinor: 1000 }] });
  assert.equal(l1.balances.B.netMinor, -2000);
  assert.equal(l1.balances.A.netMinor, 5000);
  const l2 = computeLedger({ ...base, settlements: [{ id: "s1", from: "B", to: "A", amountMinor: 3000 }, { id: "s2", from: "C", to: "A", amountMinor: 3000 }] });
  assert.deepEqual(Object.values(l2.balances).map((b) => b.netMinor), [0, 0, 0]);
  assert.equal(l1.imbalanceMinor, 0);
});
test("9. refund modelled as a settlement back (documented rule) reverses debt", () => {
  const base = { participantIds: ["A", "B"], expenses: [{ id: "e", paidBy: "A", amountMinor: 2000 }], allocations: [{ expenseId: "e", participantId: "A", shareMinor: 1000 }, { expenseId: "e", participantId: "B", shareMinor: 1000 }] };
  const paid = computeLedger({ ...base, settlements: [{ id: "s", from: "B", to: "A", amountMinor: 1000 }] });
  const refunded = computeLedger({ ...base, settlements: [{ id: "s", from: "B", to: "A", amountMinor: 1000 }, { id: "r", from: "A", to: "B", amountMinor: 1000 }] });
  assert.equal(paid.balances.B.netMinor, 0);
  assert.equal(refunded.balances.B.netMinor, -1000);
});
test("10/11. deleted excluded; duplicates counted once", () => {
  const l = computeLedger({
    participantIds: ["A", "B"],
    expenses: [
      { id: "e1", paidBy: "A", amountMinor: 1000 },
      { id: "e1", paidBy: "A", amountMinor: 1000 }, // duplicate delivery
      { id: "e2", paidBy: "A", amountMinor: 500, deleted: true },
    ],
    allocations: [
      { expenseId: "e1", participantId: "A", shareMinor: 500 }, { expenseId: "e1", participantId: "B", shareMinor: 500 },
      { expenseId: "e1", participantId: "B", shareMinor: 500 }, // duplicate
      { expenseId: "e2", participantId: "B", shareMinor: 500 },
    ],
    settlements: [],
  });
  assert.equal(l.totalExpensesMinor, 1000);
  assert.equal(l.balances.B.shareMinor, 500);
  assert.equal(l.imbalanceMinor, 0);
  assert.deepEqual(findUnreconciled([{ id: "e1", paidBy: "A", amountMinor: 1000 }], [{ expenseId: "e1", participantId: "A", shareMinor: 400 }]), ["e1"]);
});
test("12. family size change does not alter a stored snapshot", () => {
  const snap = computeAllocation({ mode: "per_person", totalMinor: 800000, participants: [A, B, C], eligibleIds: ["A", "B", "C"] });
  const grown = { ...C, memberCount: 3 };
  const later = computeAllocation({ mode: "per_person", totalMinor: 800000, participants: [A, B, grown], eligibleIds: ["A", "B", "C"] });
  assert.notDeepEqual(shares(snap), shares(later));
  // ledger consumes persisted shares, never recomputes from current counts:
  const l = computeLedger({ participantIds: ["A", "B", "C"], expenses: [{ id: "e", paidBy: "A", amountMinor: 800000 }], allocations: snap.allocations.map((a) => ({ expenseId: "e", participantId: a.participantId, shareMinor: a.shareMinor })), settlements: [] });
  assert.equal(l.balances.C.shareMinor, 200000);
  assert.equal(snap.allocations.find((a) => a.participantId === "C")!.memberCountAtTime, 2);
});
test("13. balances reconcile to zero across mixed expenses + settlements", () => {
  const ps = [A, B, C, S];
  const mk = (id: string, paidBy: string, total: number, mode: any, ids: string[]) => {
    const s = computeAllocation({ mode, totalMinor: total, participants: ps, eligibleIds: ids, responsibleId: paidBy });
    return { e: { id, paidBy, amountMinor: total }, a: s.allocations.map((x) => ({ expenseId: id, participantId: x.participantId, shareMinor: x.shareMinor })) };
  };
  const xs = [mk("1", "A", 123457, "per_person", ["A", "B", "C", "S"]), mk("2", "S", 99999, "per_family", ["A", "C", "S"]), mk("3", "C", 5001, "personal", ["C"]), mk("4", "B", 77777, "selected", ["B", "S"])];
  const l = computeLedger({ participantIds: ["A", "B", "C", "S"], expenses: xs.map((x) => x.e), allocations: xs.flatMap((x) => x.a), settlements: [{ id: "s", from: "B", to: "A", amountMinor: 1234 }] });
  assert.equal(l.imbalanceMinor, 0);
  assert.deepEqual(findUnreconciled(xs.map((x) => x.e), xs.flatMap((x) => x.a)), []);
  const plan = simplifyTransfers(Object.fromEntries(Object.entries(l.balances).map(([k, v]) => [k, v.netMinor])));
  const applied = computeLedger({ participantIds: ["A", "B", "C", "S"], expenses: xs.map((x) => x.e), allocations: xs.flatMap((x) => x.a), settlements: [{ id: "s", from: "B", to: "A", amountMinor: 1234 }, ...plan.map((t, i) => ({ id: "p" + i, from: t.from, to: t.to, amountMinor: t.amountMinor }))] });
  assert.ok(Object.values(applied.balances).every((b) => b.netMinor === 0));
});
test("participant validation", () => {
  assert.ok(validateParticipant({ mode: "family", memberCount: 0 }));
  assert.ok(validateParticipant({ mode: "family", memberCount: -2 }));
  assert.ok(validateParticipant({ mode: "family", memberCount: 2.5 }));
  assert.ok(validateParticipant({ mode: "solo", memberCount: 2 }));
  assert.equal(validateParticipant({ mode: "family", memberCount: 4 }), null);
  assert.equal(validateParticipant({ mode: "solo", memberCount: 1 }), null);
});
