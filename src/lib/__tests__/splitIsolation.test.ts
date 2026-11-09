import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { computeAllocation, computeLedger, toMinor, type EngineParticipant } from "../splitEngine.ts";
import { planVisibilityChange, audienceIds, PERSONAL_EXPLANATION } from "../splitVisibility.ts";

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");
const P: EngineParticipant[] = [
  { id: "A", mode: "family", memberCount: 3 },
  { id: "B", mode: "solo", memberCount: 1 },
  { id: "C", mode: "family", memberCount: 2 },
  { id: "D", mode: "solo", memberCount: 1 },
];
const ledgerOf = (expenses: { id: string; paidBy: string; amountMinor: number }[], allocs: { expenseId: string; participantId: string; shareMinor: number }[]) =>
  computeLedger({ participantIds: ["A", "B", "C", "D"], expenses, allocations: allocs, settlements: [] });

// ── calculation behaviour ───────────────────────────────────
test("S4. expense shared by 2 of 4 participants affects only those two", () => {
  const s = computeAllocation({ mode: "selected", totalMinor: toMinor(1000), participants: P, eligibleIds: ["A", "C"], customBasis: undefined });
  const l = ledgerOf([{ id: "e", paidBy: "A", amountMinor: 100000 }], s.allocations.map((a) => ({ expenseId: "e", participantId: a.participantId, shareMinor: a.shareMinor })));
  assert.equal(l.balances.B.netMinor, 0);
  assert.equal(l.balances.D.netMinor, 0);
  assert.equal(l.balances.A.netMinor, 50000);
  assert.equal(l.balances.C.netMinor, -50000);
});
test("S5. solo + family weights with a selected subset (per person)", () => {
  const s = computeAllocation({ mode: "per_person", totalMinor: toMinor(900), participants: P, eligibleIds: ["A", "B", "C"] });
  assert.deepEqual(s.allocations.map((a) => a.shareMinor / 100), [450, 150, 300]); // 3 : 1 : 2 people
  assert.equal(s.allocations.find((a) => a.participantId === "D"), undefined);
});
test("V1. 3 families, expense shared by the first two: only they are charged, third unaffected", () => {
  const fam: EngineParticipant[] = [
    { id: "F1", mode: "family", memberCount: 3 },
    { id: "F2", mode: "family", memberCount: 2 },
    { id: "F3", mode: "family", memberCount: 4 },
  ];
  const s = computeAllocation({ mode: "per_person", totalMinor: toMinor(1000), participants: fam, eligibleIds: ["F1", "F2"] });
  assert.deepEqual(s.allocations.map((a) => a.shareMinor / 100), [600, 400]);
  const l = computeLedger({ participantIds: ["F1", "F2", "F3"], expenses: [{ id: "e", paidBy: "F1", amountMinor: 100000 }],
    allocations: s.allocations.map((a) => ({ expenseId: "e", participantId: a.participantId, shareMinor: a.shareMinor })), settlements: [] });
  assert.equal(l.balances.F3.netMinor, 0);
  assert.equal(l.imbalanceMinor, 0);
  // the third family's view simply lacks the expense: still balanced, still zero for them
  const third = computeLedger({ participantIds: ["F1", "F2", "F3"], expenses: [], allocations: [], settlements: [] });
  assert.equal(third.balances.F3.netMinor, 0);
});
test("V2. audience = payer + sharers (deduplicated); a payer who is not sharing still sees it", () => {
  assert.deepEqual(audienceIds("F1", ["F1", "F2"]).sort(), ["F1", "F2"]);
  assert.deepEqual(audienceIds("F3", ["F1", "F2"]).sort(), ["F1", "F2", "F3"]);
});
test("V3. every division mode still works with participants-only visibility (visibility does not change the math)", () => {
  const ids = ["A", "B", "C"];
  for (const mode of ["per_person", "per_family", "selected"] as const) {
    const s = computeAllocation({ mode, totalMinor: 30000, participants: P, eligibleIds: ids });
    assert.equal(s.allocations.reduce((t, a) => t + a.shareMinor, 0), 30000);
  }
  const c = computeAllocation({ mode: "custom", customBasis: "percentage", totalMinor: 30000, participants: P, eligibleIds: ["A", "B"], customValues: { A: 25, B: 75 } });
  assert.deepEqual(c.allocations.map((a) => a.shareMinor), [7500, 22500]);
  const p = computeAllocation({ mode: "personal", totalMinor: 30000, participants: P, responsibleId: "B" });
  assert.equal(p.allocations.length, 1);
});
test("V4. visibility changes always need confirmation; no-op does not", () => {
  assert.equal(planVisibilityChange("group", "group").needsConfirmation, false);
  assert.equal(planVisibilityChange("participants", "participants").needsConfirmation, false);
  assert.match(planVisibilityChange("group", "participants").message!, /no longer see it/);
  assert.match(planVisibilityChange("participants", "group").message!, /Every group member/);
  assert.match(PERSONAL_EXPLANATION, /members sharing this expense/);
});

// ── navigation (static checks on source) ────────────────────
test("S10. Split nav uses the router: no window.open / target=_blank to /split", () => {
  for (const f of ["src/components/layout/AppSidebar.tsx", "src/components/layout/MobileBottomNav.tsx"]) {
    const src = read(f);
    assert.ok(!/href="\/split"/.test(src), `${f} still has a raw /split anchor`);
    assert.ok(/url: "\/split"/.test(src) && /<(Nav)?Link\b[^>]*\bto=\{/.test(src), `${f} must link to /split via the router`);
  }
  const all = readdirSync(new URL("../../", import.meta.url), { recursive: true, withFileTypes: false }) as string[];
  for (const f of all.filter((x) => /(split|Split|layout).*\.tsx?$/.test(x) && !x.includes("__tests__"))) {
    const src = read(`src/${f}`);
    assert.ok(!/window\.open\(/.test(src), `${f} uses window.open`);
    if (/split/i.test(f)) assert.ok(!/target="_blank"/.test(src), `${f} opens a new tab`);
  }
});
test("S11. /split routes render inside the shared AppLayout (history back/forward works via react-router)", () => {
  const app = read("src/App.tsx");
  assert.match(app, /path="\/split"[^\n]*<AppLayout><SplitHome \/><\/AppLayout>/);
  assert.match(app, /path="\/split\/:id"[^\n]*<AppLayout><SplitGroupDetail \/><\/AppLayout>/);
  assert.ok(!/SplitLayout/.test(app));
});

// ── isolation from personal transactions (static checks on source + migration) ──
test("S1/S8/S12. Split code never writes to `transactions`; migration forbids it", () => {
  const files = (readdirSync(new URL("../../", import.meta.url), { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__") && !f.includes("integrations"));
  for (const f of files) {
    const src = read(`src/${f}`);
    assert.ok(!/group_expense_auto|group_settlement_auto|group_expense_id|group_settlement_id/.test(src), `${f} references Split↔transactions linkage`);
  }
  const m = read("supabase/migrations/009_split_isolation_block_guard.sql");
  assert.match(m, /transactions_not_split_chk/);
  assert.match(m, /split_mirrored_transactions_archive/);
  // archive happens BEFORE the delete (no data loss)
  assert.ok(m.indexOf("INSERT INTO public.split_mirrored_transactions_archive") < m.indexOf("DELETE FROM public.transactions"));
  const settleFn = m.slice(m.indexOf("record_group_settlement("), m.indexOf("-- ─── 2."));
  assert.ok(!/INSERT INTO public\.transactions/.test(settleFn));
});

// ── RLS definition (static check — NOT a substitute for running the SQL tests) ──
test("V5. migration 010 restricts expenses, splits and audit rows to the audience", () => {
  const m = read("supabase/migrations/010_participant_expenses_block_guard.sql");
  assert.match(m, /CREATE POLICY "Members can view group expenses"[\s\S]*can_see_expense\(id\)/);
  assert.match(m, /CREATE POLICY "Members can view splits"[\s\S]*can_see_expense\(expense_id\)/);
  assert.match(m, /CREATE POLICY "Members can view audit"[\s\S]*restricted_member_ids/);
  assert.match(m, /e\.visibility = 'group'\s+OR public\._my_member_id\(e\.group_id\) = ANY \(public\._expense_audience\(e\.id\)\)/);
  assert.ok(!/ALTER PUBLICATION[^;]*group_private_expenses/.test(m));
  // direct client writes stay revoked (008) and the old unrestricted save function is dropped
  assert.match(m, /DROP FUNCTION IF EXISTS public\.save_group_expense\(UUID, UUID, TEXT, NUMERIC, TEXT, UUID, TEXT, TEXT, DATE, TEXT, JSONB, INTEGER\)/);
  // every audit write inside the expense RPCs passes the audience
  const save = m.slice(m.indexOf("CREATE OR REPLACE FUNCTION public.save_group_expense("), m.indexOf("GRANT EXECUTE ON FUNCTION public.save_group_expense"));
  assert.ok((save.match(/_audit_group_event\(/g) ?? []).length >= 5);
  assert.ok((save.match(/_aud\s*\)/g) ?? []).length >= 5);
});
