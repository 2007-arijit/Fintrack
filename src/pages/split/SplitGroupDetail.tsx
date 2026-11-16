import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGroups, GROUP_TYPES } from "@/hooks/useGroups";
import { useGroupExpenses, useGroupLedgerRealtime } from "@/hooks/useGroupExpenses";
import type { GroupExpense } from "@/hooks/useGroupExpenses";
import { formatCurrency, CurrencyCode } from "@/lib/formatCurrency";
import { getCategoryByValue } from "@/lib/categoryConfig";
import { memberDisplayName } from "@/lib/memberDisplay";
import { DIVISION_MODE_LABEL, fromMinor } from "@/lib/splitEngine";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FinancialAmount } from "@/components/FinancialAmount";
import { AddGroupExpenseModal } from "@/components/groups/AddGroupExpenseModal";
import { Badge } from "@/components/ui/badge";
import { SettleUpModal } from "@/components/groups/SettleUpModal";
import { GroupSettingsModal } from "@/components/groups/GroupSettingsModal";
import { GroupAuditTab } from "@/components/groups/GroupAuditTab";
import { EditParticipantDialog } from "@/components/groups/EditParticipantDialog";
import { ParticipantModeTag } from "@/components/groups/ParticipantModeTag";
import { UpiSetupBanner } from "@/components/groups/UpiSetupBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import {
  Plus,
  ArrowRight,
  ArrowRightLeft,
  Trash2,
  Receipt,
  Scale,
  History,
  Settings as SettingsIcon,
  Pencil,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SplitGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { groups, members: allMembers, setGroupArchived, removeMember, addMember, updateParticipant, isLoading: groupsLoading } = useGroups();
  const group = groups.find((g) => g.id === id);
  const members = useMemo(() => allMembers.filter((m) => m.group_id === id), [allMembers, id]);
  const isAdmin = !!group && group.user_id === user?.id;
  const isArchived = !!group?.archived;

  useGroupLedgerRealtime(id);
  const {
    expenses, splits, settlements, hiddenCount, amountState, ledger, refetch, error,
    balances, simplifiedTransfers, yourNetBalance, youMember, saveExpense, deleteExpense, settleUp, deleteSettlement,
  } = useGroupExpenses(id, members);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editing, setEditing] = useState<GroupExpense | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settleData, setSettleData] = useState<{ from?: string; to?: string; amount?: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; version: number } | null>(null);
  const [deleteSettlementId, setDeleteSettlementId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editMemberId, setEditMemberId] = useState<string | null>(null);

  const currency = (group?.currency ?? "INR") as CurrencyCode;
  const format$ = (n: number) => formatCurrency(n, currency);
  const memberName = (mid: string) => memberDisplayName(members.find((m) => m.id === mid), user?.id);
  const typeInfo = useMemo(() => GROUP_TYPES.find((t) => t.value === group?.group_type), [group]);
  const editingSplits = useMemo(() => (editing ? splits.filter((s) => s.expense_id === editing.id) : []), [editing, splits]);

  if (groupsLoading && !group) {
    return (
      <div className="space-y-4" data-testid="group-skeleton">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }
  if (!group) {
    return <EmptyState title="Group not found" description="This group may have been deleted." actionLabel="Back to Groups" onAction={() => navigate("/split")} />;
  }

  const amt = (n: number | undefined, className?: string, w?: string) => (
    <FinancialAmount state={amountState} value={n} format={format$} className={className} skeletonClassName={w} />
  );
  const busy = saveExpense.isPending || deleteExpense.isPending || settleUp.isPending || deleteSettlement.isPending;
  const closeModal = () => { setShowAddExpense(false); setEditing(null); };

  const hasBalance = amountState === "ready" && yourNetBalance !== undefined;
  const settled = hasBalance && Math.abs(yourNetBalance) < 0.005;
  const owed = hasBalance && yourNetBalance > 0;

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <PageHeader
        backTo="/split"
        backLabel="All groups"
        eyebrow={typeInfo ? `${typeInfo.label} · ${members.length} ${members.length === 1 ? "member" : "members"}` : "Split group"}
        title={group.name}
        actions={
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 border-border bg-card/40"
            onClick={() => setShowSettings(true)}
            aria-label="Group settings"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        }
      />

      {!isArchived && <UpiSetupBanner />}

      {isArchived && (
        <div className="surface-flat px-4 py-3 text-sm text-muted-foreground">
          Archived group — history is preserved and this group is read-only. The admin can restore it from Group
          settings.
        </div>
      )}

      {hiddenCount > 0 && amountState === "ready" && (
        <p className="text-xs leading-relaxed text-muted-foreground" data-testid="hidden-note">
          Some expenses are shared only among the members involved, so they aren't shown to you. They don't affect
          your balance.
        </p>
      )}

      {amountState === "error" && (
        <div className="glass-card space-y-2 p-4 text-center" role="alert">
          <p className="text-sm text-destructive">
            Couldn't load this group's amounts{error?.message ? ` — ${error.message}` : ""}.
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5 border-border">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
          </Button>
        </div>
      )}

      {/* Balance hero — derived from the single canonical ledger. */}
      <section className="surface-elevated relative overflow-hidden p-5 sm:p-6" aria-label="Your balance in this group">
        <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] sm:items-end">
          <div className="min-w-0">
            <p className="eyebrow">
              {settled ? "All square" : hasBalance ? (owed ? "Owed to you" : "You owe") : "Your balance"}
            </p>

            {settled ? (
              <p className="display-amount mt-2 text-3xl text-foreground sm:text-4xl">Settled up</p>
            ) : (
              <p className="display-amount mt-2 text-[2.1rem] text-foreground sm:text-4xl">
                {amt(hasBalance ? Math.abs(yourNetBalance) : undefined, undefined, "w-32")}
              </p>
            )}

            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {settled
                ? "Nothing outstanding between you and this group."
                : hasBalance
                  ? owed
                    ? "Your share of what you paid is still owed back to you."
                    : "What you still owe after expenses and recorded settlements."
                  : "Calculating from this group's ledger…"}
            </p>
          </div>

          <dl className="grid gap-4 sm:border-l sm:border-border/70 sm:pl-6">
            <div>
              <dt className="eyebrow text-[10px]">Total group expenses</dt>
              <dd className="stat-amount mt-1 text-lg text-foreground">
                {amt(ledger ? fromMinor(ledger.totalExpensesMinor, currency) : undefined, undefined, "w-24")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Recorded settlements</dt>
              <dd className="tabular mt-0.5 text-sm text-foreground">{settlements.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      {!isArchived && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowAddExpense(true)} className="flex-1 gap-1.5" disabled={amountState === "error"}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add expense
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 border-border bg-card/40"
            onClick={() => setSettleData({})}
            disabled={amountState === "error"}
          >
            <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Settle up
          </Button>
        </div>
      )}

      <Tabs defaultValue="expenses">
        <TabsList className="grid h-11 w-full grid-cols-3 rounded-xl border border-border bg-secondary/40 p-1">
          <TabsTrigger value="expenses" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-card sm:text-sm">
            <Receipt className="h-3.5 w-3.5" aria-hidden="true" /> Expenses
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-card sm:text-sm">
            <Scale className="h-3.5 w-3.5" aria-hidden="true" /> Balances
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 rounded-lg text-xs data-[state=active]:bg-card sm:text-sm">
            <History className="h-3.5 w-3.5" aria-hidden="true" /> Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="mt-4 space-y-3">
          {amountState === "loading" ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)
          ) : expenses.length === 0 && amountState !== "error" ? (
            <div className="glass-card">
              <EmptyState
                title="No expenses yet"
                description="Add the first shared expense for this group and it will appear here with its split."
                actionLabel="Add expense"
                onAction={() => setShowAddExpense(true)}
              />
            </div>
          ) : (
            expenses.map((e) => {
              const cat = getCategoryByValue(e.category);
              const rows = splits.filter((s) => s.expense_id === e.id);
              const open = expanded === e.id;
              return (
                <article key={e.id} className="glass-card overflow-hidden" data-testid="expense-row">
                  <div className="flex items-start gap-3 p-4">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary/60 text-base"
                      aria-hidden="true"
                    >
                      {cat?.emoji ?? "📝"}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate text-sm font-medium text-foreground">{e.description}</p>
                        {e.visibility === "participants" && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-border px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                          >
                            <Lock className="h-2.5 w-2.5" aria-hidden="true" /> Personal
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Paid by {memberName(e.paid_by)}
                        <span className="mx-1.5 text-border" aria-hidden="true">/</span>
                        {format(parseISO(e.expense_date), "d MMM yyyy")}
                        <span className="mx-1.5 text-border" aria-hidden="true">/</span>
                        {DIVISION_MODE_LABEL[e.division_mode] ?? e.division_mode}
                      </p>
                      {e.notes && <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{e.notes}</p>}
                    </div>

                    <p className="stat-amount shrink-0 text-sm text-foreground">
                      {amt(Number(e.amount), undefined, "w-16")}
                    </p>
                  </div>

                  {open && (
                    <div className="border-t border-border/70 bg-secondary/20 px-4 py-3" data-testid="expense-allocation">
                      <p className="eyebrow mb-2 text-[10px]">Split</p>
                      <div className="space-y-1.5">
                        {rows.map((s) => (
                          <div key={s.id} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {memberName(s.member_id)}
                              {s.mode_at_time === "family" && s.member_count_at_time ? ` · ${s.member_count_at_time} people` : ""}
                            </span>
                            {amt(Number(s.share_amount), "stat-amount text-foreground", "w-14")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-0.5 border-t border-border/60 px-2 py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                      onClick={() => setExpanded(open ? null : e.id)}
                      aria-expanded={open}
                      aria-label={open ? "Hide split" : "Show split"}
                    >
                      {open ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                      Split
                    </Button>
                    {!isArchived && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={busy}
                          onClick={() => setEditing(e)}
                          aria-label="Edit expense"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => setDeleteTarget({ id: e.id, version: e.version })}
                          aria-label="Delete expense"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="balances" className="mt-4 space-y-5">
          <section aria-labelledby="group-balances">
            <h3 id="group-balances" className="eyebrow mb-2.5">
              {hiddenCount > 0 ? "Your balance" : "Net balance per member"}
            </h3>
            <div className="glass-card divide-y divide-border/60">
              {members
                .filter((m) => hiddenCount === 0 || m.id === youMember?.id)
                .map((m) => {
                  const b = ledger?.balances[m.id];
                  const bal = balances[m.id];
                  const settledUp = amountState === "ready" && bal !== undefined && Math.abs(bal) < 0.005;
                  return (
                    <div key={m.id} className="flex items-start justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <span className="min-w-0 truncate">{memberDisplayName(m, user?.id)}</span>
                          <ParticipantModeTag mode={m.participation_mode} memberCount={m.member_count} />
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          <span>Paid {amt(b ? fromMinor(b.paidMinor, currency) : undefined, undefined, "w-12")}</span>
                          <span>Share {amt(b ? fromMinor(b.shareMinor, currency) : undefined, undefined, "w-12")}</span>
                          <span>
                            Settled {amt(b ? fromMinor(b.settledOutMinor - b.settledInMinor, currency) : undefined, undefined, "w-12")}
                          </span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-right text-sm",
                          settledUp
                            ? "text-muted-foreground"
                            : bal !== undefined && bal > 0
                              ? "stat-amount text-success"
                              : "stat-amount text-destructive",
                        )}
                      >
                        {settledUp ? (
                          "settled up"
                        ) : (
                          <>
                            {amountState === "ready" && bal !== undefined ? (bal > 0 ? "gets back " : "owes ") : ""}
                            {amt(bal === undefined ? undefined : Math.abs(bal), undefined, "w-16")}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          </section>

          <section aria-labelledby="group-settle-ups">
            <h3 id="group-settle-ups" className="eyebrow mb-2.5">
              Suggested settle-ups
            </h3>
            {amountState !== "ready" ? (
              <Skeleton className="h-14 w-full rounded-2xl" />
            ) : simplifiedTransfers.length === 0 ? (
              <p className="surface-flat px-4 py-3 text-sm text-muted-foreground">
                Nobody owes anybody — the group is square.
              </p>
            ) : (
              <div className="glass-card divide-y divide-border/60">
                {simplifiedTransfers.map((t, i) => (
                  <div key={`${t.fromMemberId}-${t.toMemberId}-${i}`} className="flex items-center justify-between gap-3 p-3.5">
                    <p className="min-w-0 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{memberName(t.fromMemberId)}</span>
                      <ArrowRight className="mx-1.5 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
                      <span className="font-medium text-foreground">{memberName(t.toMemberId)}</span>
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="stat-amount text-sm text-foreground">{format$(t.amount)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-border bg-card/40"
                        onClick={() => setSettleData({ from: t.fromMemberId, to: t.toMemberId, amount: t.amount })}
                      >
                        Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {settlements.length > 0 && (
            <section aria-labelledby="group-settlements">
              <h3 id="group-settlements" className="eyebrow mb-2.5">
                Recorded settlements
              </h3>
              <div className="glass-card divide-y divide-border/60">
                {settlements.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 p-3.5">
                    <p className="min-w-0 truncate text-sm text-muted-foreground">
                      <span className="text-foreground">{memberName(s.from_member_id)}</span>
                      <ArrowRight className="mx-1.5 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
                      <span className="text-foreground">{memberName(s.to_member_id)}</span>
                      <span className="ml-1.5 text-xs">· {format(parseISO(s.settled_at), "d MMM")}</span>
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {amt(Number(s.amount), "stat-amount text-sm text-foreground", "w-14")}
                      {!isArchived && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => setDeleteSettlementId(s.id)}
                          aria-label="Remove settlement"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <GroupAuditTab groupId={group.id} members={members} formatCurr={format$} />
        </TabsContent>
      </Tabs>

      {!isArchived && members.length > 0 && (
        <AddGroupExpenseModal
          key={editing ? `edit-${editing.id}-${editing.version}` : "new"}
          open={showAddExpense || !!editing}
          onOpenChange={(o) => { if (!o) closeModal(); }}
          members={members}
          currency={currency}
          formatCurr={format$}
          expense={editing ? { row: editing, splits: editingSplits } : null}
          pending={saveExpense.isPending}
          onSubmit={(data) => saveExpense.mutate({ ...data, expenseId: editing?.id, expectedVersion: editing?.version }, { onSuccess: closeModal })}
        />
      )}

      {!isArchived && members.length > 0 && settleData !== null && (
        <SettleUpModal
          open={settleData !== null}
          onOpenChange={(o) => !o && setSettleData(null)}
          members={members}
          groupId={group.id}
          groupName={group.name}
          formatCurr={format$}
          defaultFrom={settleData.from}
          defaultTo={settleData.to}
          defaultAmount={settleData.amount}
          onSubmit={(data) => settleUp.mutate(data, { onSuccess: () => setSettleData(null) })}
        />
      )}

      <GroupSettingsModal
        open={showSettings}
        onOpenChange={setShowSettings}
        group={group}
        members={members}
        isAdmin={isAdmin}
        onAddMember={(userId, name) => addMember.mutate({ groupId: group.id, userId, name })}
        onRemoveMember={(memberId) => removeMember.mutate(memberId)}
        onEditMember={(memberId) => setEditMemberId(memberId)}
        onArchiveGroup={(archived) => {
          setGroupArchived.mutate({ groupId: group.id, archived }, {
            onSuccess: () => { if (archived) navigate("/split"); },
          });
        }}
      />

      <EditParticipantDialog
        open={!!editMemberId}
        onOpenChange={(o) => !o && setEditMemberId(null)}
        member={members.find((m) => m.id === editMemberId) ?? null}
        pending={updateParticipant.isPending}
        onSave={(v) => updateParticipant.mutate(v, { onSuccess: () => setEditMemberId(null) })}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Expense"
        description="This removes the expense from balances and totals. It stays in Group Audit with its original amount and allocation."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (deleteTarget) deleteExpense.mutate(deleteTarget); setDeleteTarget(null); }}
      />
      <ConfirmDialog
        open={!!deleteSettlementId}
        onOpenChange={(o) => !o && setDeleteSettlementId(null)}
        title="Remove Settlement"
        description="The settlement stops counting toward balances. The removal is recorded in Group Audit."
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (deleteSettlementId) deleteSettlement.mutate(deleteSettlementId); setDeleteSettlementId(null); }}
      />
    </div>
  );
}
