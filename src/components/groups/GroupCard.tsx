import { useNavigate } from "react-router-dom";
import { Group, GroupMember, GROUP_TYPES } from "@/hooks/useGroups";
import { useGroupExpenses } from "@/hooks/useGroupExpenses";
import { formatCurrency, CurrencyCode } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { FinancialAmount } from "@/components/FinancialAmount";

interface GroupCardProps {
  group: Group;
  members: GroupMember[];
}

export function GroupCard({ group, members }: GroupCardProps) {
  const navigate = useNavigate();
  const { yourNetBalance, amountState } = useGroupExpenses(group.id, members);
  const typeInfo = GROUP_TYPES.find((t) => t.value === group.group_type);
  const format = (n: number) => formatCurrency(Math.abs(n), group.currency as CurrencyCode);

  return (
    <button onClick={() => navigate(`/split/${group.id}`)} className="glass-card p-4 w-full text-left hover:bg-secondary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{typeInfo?.emoji ?? "📁"}</span>
            <span className="font-semibold truncate">{group.name}</span>
            {group.archived && <Badge variant="secondary">Archived</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {members.length} member{members.length !== 1 ? "s" : ""} · {typeInfo?.label ?? "Group"}
          </p>
        </div>
        <div className="text-right shrink-0">
          {amountState === "ready" && yourNetBalance !== undefined && Math.abs(yourNetBalance) < 0.005 ? (
            <Badge variant="outline" className="border-border text-muted-foreground">Settled up</Badge>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">
                {amountState === "ready" && yourNetBalance !== undefined ? (yourNetBalance > 0 ? "you are owed" : "you owe") : "your balance"}
              </p>
              <p className={"font-bold " + (yourNetBalance !== undefined && yourNetBalance > 0 ? "text-success" : "text-destructive")}>
                <FinancialAmount state={amountState} value={yourNetBalance} format={format} skeletonClassName="w-16" />
              </p>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
