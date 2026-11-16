import { useNavigate } from "react-router-dom";
import { Group, GroupMember, GROUP_TYPES } from "@/hooks/useGroups";
import { useGroupExpenses } from "@/hooks/useGroupExpenses";
import { formatCurrency, CurrencyCode } from "@/lib/formatCurrency";
import { Badge } from "@/components/ui/badge";
import { FinancialAmount } from "@/components/FinancialAmount";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface GroupCardProps {
  group: Group;
  members: GroupMember[];
}

export function GroupCard({ group, members }: GroupCardProps) {
  const navigate = useNavigate();
  const { yourNetBalance, amountState } = useGroupExpenses(group.id, members);
  const typeInfo = GROUP_TYPES.find((t) => t.value === group.group_type);
  const format = (n: number) => formatCurrency(Math.abs(n), group.currency as CurrencyCode);

  const ready = amountState === "ready" && yourNetBalance !== undefined;
  const settled = ready && Math.abs(yourNetBalance) < 0.005;
  const owed = ready && !settled && yourNetBalance > 0;

  return (
    <button
      type="button"
      onClick={() => navigate(`/split/${group.id}`)}
      className="group glass-card card-interactive flex w-full items-center gap-3.5 p-4 text-left focus-visible:outline-none"
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border/70 bg-secondary/50 text-lg"
        aria-hidden="true"
      >
        {typeInfo?.emoji ?? "📁"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-medium text-foreground">{group.name}</p>
          {group.archived && (
            <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
              Archived
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {members.length} {members.length === 1 ? "member" : "members"}
          <span className="mx-1.5 text-border" aria-hidden="true">
            /
          </span>
          {typeInfo?.label ?? "Group"}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {settled ? (
          <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            Settled up
          </span>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {ready ? (owed ? "You are owed" : "You owe") : "Your balance"}
            </p>
            <p
              className={cn(
                "stat-amount mt-0.5 text-sm",
                ready ? (owed ? "text-success" : "text-destructive") : "text-foreground",
              )}
            >
              <FinancialAmount
                state={amountState}
                value={yourNetBalance}
                format={format}
                skeletonClassName="w-16"
              />
            </p>
          </>
        )}
      </div>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  );
}
