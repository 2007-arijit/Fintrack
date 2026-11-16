import { useState } from "react";
import { useGroups } from "@/hooks/useGroups";
import { useGroupLedgerRealtime } from "@/hooks/useGroupExpenses";
import { useCurrency } from "@/contexts/CurrencyContext";
import { EmptyState } from "@/components/EmptyState";
import { GroupCard } from "@/components/groups/GroupCard";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";
import { UpiSetupBanner } from "@/components/groups/UpiSetupBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Archive } from "lucide-react";

export default function SplitHome() {
  const { groups, members, isLoading, createGroup } = useGroups();
  const { currency } = useCurrency();
  const [showCreate, setShowCreate] = useState(false);
  const activeGroups = groups.filter((group) => !group.archived);
  const archivedGroups = groups.filter((group) => group.archived);
  useGroupLedgerRealtime();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Shared money"
        title="Split"
        description="Bills, trips and shared households — kept in one running ledger so nobody has to remember who paid for what."
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New group
          </Button>
        }
      />

      <UpiSetupBanner />

      {isLoading && groups.length === 0 ? (
        <div className="grid gap-3 lg:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-2xl" />
          ))}
        </div>
      ) : activeGroups.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            title={groups.length > 0 ? "No active groups" : "No groups yet"}
            description={
              groups.length > 0
                ? "Your groups are archived below. Restore one to add new expenses and settlements."
                : "Create a group for a trip, household or friend circle. Everyone you split with needs a FinTrack account."
            }
            actionLabel="New group"
            onAction={() => setShowCreate(true)}
          />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {activeGroups.map((g) => (
            <GroupCard key={g.id} group={g} members={members.filter((m) => m.group_id === g.id)} />
          ))}
        </div>
      )}

      {archivedGroups.length > 0 && (
        <section className="space-y-3 pt-2" aria-labelledby="archived-groups">
          <div className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <h2 id="archived-groups" className="eyebrow">
              Archived
            </h2>
            <span className="tabular text-xs text-muted-foreground">({archivedGroups.length})</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {archivedGroups.map((g) => (
              <GroupCard key={g.id} group={g} members={members.filter((m) => m.group_id === g.id)} />
            ))}
          </div>
        </section>
      )}

      <CreateGroupModal
        open={showCreate}
        onOpenChange={setShowCreate}
        defaultCurrency={currency}
        onSubmit={(data) => {
          createGroup.mutate(data);
          setShowCreate(false);
        }}
      />
    </div>
  );
}
