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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Plus, ArrowRightLeft, Trash2, Receipt, Scale, History, Settings as SettingsIcon, Pencil, ChevronDown, ChevronUp, RotateCcw, Lock } from "lucide-react";

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
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
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

  return (
    <div className="space-y-4 animate-fade-in min-w-0 max-w-full">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate("/split")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="font-heading font-bold text-2xl flex-1 truncate">{typeInfo?.emoji} {group.name}</h1>
        <Button size="icon" variant="ghost" onClick={() => setShowSettings(true)} aria-label="Group settings"><SettingsIcon className="h-4 w-4" /></Button>
      </div>

      {!isArchived && <UpiSetupBanner />}

      {isArchived && (
        <div className="rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">
          Archived group — history is preserved and this group is read-only. The admin can restore it from Group Settings.
        </div>
      )}

      {hiddenCount > 0 && amountState === "ready" && (
        <p className="text-xs text-muted-foreground text-center" data-testid="hidden-note">
          Some expenses are shared only among the members involved, so they aren't shown to you. They don't affect your balance.
        </p>
      )}

      {amountState === "error" && (
        <div className="glass-card p-4 text-center space-y-2" role="alert">
          <p className="text-sm text-destructive">Couldn't load this group's amounts{error?.message ? ` — ${error.message}` : ""}.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1"><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>
        </div>
      )}

      {/* Balance summary — derived from the single canonical ledger */}
      <div className="glass-card p-4 space-y-1">
        {amountState === "ready" && yourNetBalance !== undefined && Math.abs(yourNetBalance) < 0.005 ? (
          <p className="font-semibold text-center py-1">You're all settled up 🎉</p>
        ) : (
          <p className="font-semibold text-center py-1">
            {amountState === "ready" && yourNetBalance !== undefined ? (yourNetBalance > 0 ? "Overall, you are owed " : "Overall, you owe ") : "Your balance "}
            {amt(yourNetBalance === undefined ? undefined : Math.abs(yourNetBalance), yourNetBalance !== undefined && yourNetBalance > 0 ? "text-success" : "text-destructive", "w-24")}
          </p>
        )}
        <p className="text-xs text-muted-foreground text-center">
          Total group expenses {amt(ledger ? fromMinor(ledger.totalExpensesMinor, currency) : undefined, "font-medium text-foreground", "w-20")}
        </p>
      </div>

      {!isArchived && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowAddExpense(true)} className="flex-1 gap-1" disabled={amountState === "error"}><Plus className="h-4 w-4" /> Add Expense</Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1 border-primary text-primary" onClick={() => setSettleData({})} disabled={amountState === "error"}><ArrowRightLeft className="h-4 w-4" /> Settle Up</Button>
        </div>
      )}

      <Tabs defaultValue="expenses">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="expenses" className="gap-1"><Receipt className="h-3.5 w-3.5" /> Expenses</TabsTrigger>
          <TabsTrigger value="balances" className="gap-1"><Scale className="h-3.5 w-3.5" /> Balances</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1"><History className="h-3.5 w-3.5" /> Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-3 mt-4">
          {amountState === "loading" ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : expenses.length === 0 && amountState !== "error" ? (
            <EmptyState title="No expenses yet" description="Add the first shared expense for this group." actionLabel="Add Expense" onAction={() => setShowAddExpense(true)} />
          ) : (
            expenses.map((e) => {
              const cat = getCategoryByValue(e.category);
              const rows = splits.filter((s) => s.expense_id === e.id);
              const open = expanded === e.id;
              return (
                <div key={e.id} className="glass-card p-4 min-w-0 overflow-hidden" data-testid="expense-row">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0"><span className="shrink-0">{cat?.emoji ?? "📝"}</span><span className="font-semibold truncate min-w-0">{e.description}</span>{e.visibility === "participants" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 shrink-0"><Lock className="h-3 w-3" /> PERSONAL</Badge>}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Paid by {memberName(e.paid_by)} · {format(parseISO(e.expense_date), "MMM dd, yyyy")} · {DIVISION_MODE_LABEL[e.division_mode] ?? e.division_mode}
                      </p>
                      {e.notes && <p className="text-xs text-muted-foreground mt-1 break-words">{e.notes}</p>}
                    </div>
                    <div className="text-right shrink-0"><p className="font-bold">{amt(Number(e.amount), undefined, "w-16")}</p></div>
                  </div>
                  {open && (
                    <div className="mt-3 border-t border-border pt-2 space-y-1" data-testid="expense-allocation">
                      {rows.map((s) => (
                        <div key={s.id} className="flex justify-between text-xs">
                          <span className="truncate">{memberName(s.member_id)}{s.mode_at_time === "family" && s.member_count_at_time ? ` · ${s.member_count_at_time} people` : ""}</span>
                          {amt(Number(s.share_amount), undefined, "w-14")}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end gap-1 mt-2">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setExpanded(open ? null : e.id)} aria-label="Toggle allocation">
                      {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    {!isArchived && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => setEditing(e)} aria-label="Edit expense"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive h-7" disabled={busy} onClick={() => setDeleteTarget({ id: e.id, version: e.version })} aria-label="Delete expense"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="balances" className="space-y-4 mt-4">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{hiddenCount > 0 ? "Your balance" : "Net balance per member"}</h3>
            <div className="space-y-2">
              {members.filter((m) => hiddenCount === 0 || m.id === youMember?.id).map((m) => {
                const b = ledger?.balances[m.id];
                const bal = balances[m.id];
                const settledUp = amountState === "ready" && bal !== undefined && Math.abs(bal) < 0.005;
                return (
                  <div key={m.id} className="glass-card p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate flex items-center gap-1.5">
                        {memberDisplayName(m, user?.id)}
                        <ParticipantModeTag mode={m.participation_mode} memberCount={m.member_count} />
                      </span>
                      <span className={settledUp ? "text-muted-foreground text-sm" : bal !== undefined && bal > 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>
                        {settledUp ? "settled up" : (
                          <>{amountState === "ready" && bal !== undefined ? (bal > 0 ? "gets back " : "owes ") : ""}{amt(bal === undefined ? undefined : Math.abs(bal), undefined, "w-16")}</>
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Paid {amt(b ? fromMinor(b.paidMinor, currency) : undefined, undefined, "w-12")} · Share {amt(b ? fromMinor(b.shareMinor, currency) : undefined, undefined, "w-12")} · Settled {amt(b ? fromMinor(b.settledOutMinor - b.settledInMinor, currency) : undefined, undefined, "w-12")}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">Suggested settle-ups</h3>
            {amountState !== "ready" ? (
              <Skeleton className="h-12 w-full" />
            ) : simplifiedTransfers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody owes anybody — you're all square.</p>
            ) : (
              <div className="space-y-2">
                {simplifiedTransfers.map((t, i) => (
                  <div key={`${t.fromMemberId}-${t.toMemberId}-${i}`} className="glass-card p-3 flex items-center justify-between gap-2">
                    <span className="text-sm"><span className="font-medium">{memberName(t.fromMemberId)}</span> owes <span className="font-medium">{memberName(t.toMemberId)}</span></span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-semibold">{format$(t.amount)}</span>
                      <Button size="sm" variant="outline" className="border-primary text-primary h-7" onClick={() => setSettleData({ from: t.fromMemberId, to: t.toMemberId, amount: t.amount })}>Settle</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {settlements.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Recorded settlements</h3>
              <div className="space-y-2">
                {settlements.map((s) => (
                  <div key={s.id} className="glass-card p-3 flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{memberName(s.from_member_id)} → {memberName(s.to_member_id)} <span className="text-xs text-muted-foreground">· {format(parseISO(s.settled_at), "MMM dd")}</span></span>
                    <div className="flex items-center gap-1 shrink-0">
                      {amt(Number(s.amount), "font-semibold text-sm", "w-14")}
                      {!isArchived && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={busy} onClick={() => setDeleteSettlementId(s.id)} aria-label="Remove settlement"><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
