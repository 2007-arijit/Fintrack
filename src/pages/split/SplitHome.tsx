import { useState } from "react";
import { useGroups } from "@/hooks/useGroups";
import { useGroupLedgerRealtime } from "@/hooks/useGroupExpenses";
import { useCurrency } from "@/contexts/CurrencyContext";
import { EmptyState } from "@/components/EmptyState";
import { GroupCard } from "@/components/groups/GroupCard";
import { CreateGroupModal } from "@/components/groups/CreateGroupModal";
import { UpiSetupBanner } from "@/components/groups/UpiSetupBanner";
import { Button } from "@/components/ui/button";
import { Plus, Users, Archive } from "lucide-react";

export default function SplitHome() {
  const { groups, members, isLoading, createGroup } = useGroups();
  const { currency } = useCurrency();
  const [showCreate, setShowCreate] = useState(false);
  const activeGroups = groups.filter((group) => !group.archived);
  const archivedGroups = groups.filter((group) => group.archived);
  useGroupLedgerRealtime();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-bold text-2xl flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Your Groups
        </h1>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New Group
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Split bills and shared expenses with friends — Splitwise-style. Everyone in a group needs a FinTrack account.
      </p>

      <UpiSetupBanner />

      {activeGroups.length === 0 && !isLoading ? (
        <EmptyState
          title={groups.length > 0 ? "No active groups" : "No groups yet"}
          description={groups.length > 0
            ? "Your groups are archived below. Restore one to add new expenses and settlements."
            : "Create a group for a trip, household, or friend circle to start splitting shared expenses."}
          actionLabel="New Group"
          onAction={() => setShowCreate(true)}
        />
      ) : (
        <div className="space-y-3">
          {activeGroups.map((g) => (
            <GroupCard key={g.id} group={g} members={members.filter((m) => m.group_id === g.id)} />
          ))}
        </div>
      )}

      {archivedGroups.length > 0 && (
        <section className="space-y-3 pt-3">
          <h2 className="font-heading font-semibold text-base flex items-center gap-2 text-muted-foreground">
            <Archive className="h-4 w-4" /> Archived Groups ({archivedGroups.length})
          </h2>
          <div className="space-y-3">
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
        onSubmit={(data) => { createGroup.mutate(data); setShowCreate(false); }}
      />
    </div>
  );
}
