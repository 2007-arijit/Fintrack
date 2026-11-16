import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useGroupAudit, flattenAudit, AUDIT_ACTIONS, AuditEvent, AuditFilters } from "@/hooks/useGroupAudit";
import { GroupMember } from "@/hooks/useGroups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Search, RotateCcw } from "lucide-react";

const ALL = "__all__";

const tone = (a: string) =>
  a.endsWith("created") || a === "member_joined" || a === "member_added" ? "text-success border-success/40"
  : a.endsWith("deleted") || a === "member_removed" || a === "invite_revoked" ? "text-destructive border-destructive/40"
  : "text-primary border-primary/40";

const label = (a: string) => AUDIT_ACTIONS.find((x) => x.value === a)?.label ?? a.replace(/_/g, " ");

type Alloc = { member_id: string; member_name?: string; share_amount: number; member_count?: number | null; mode?: string | null };
const asAllocs = (v: unknown): Alloc[] => (Array.isArray(v) ? (v as Alloc[]) : []);
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});

function AllocTable({ title, rows, fmt }: { title: string; rows: Alloc[]; fmt: (n: number) => string }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{title}</p>
      {rows.map((r) => (
        <div key={r.member_id} className="flex justify-between text-xs">
          <span className="truncate">{r.member_name ?? "Participant"}{r.mode === "family" && r.member_count ? ` · ${r.member_count} people` : ""}</span>
          <span>{fmt(Number(r.share_amount))}</span>
        </div>
      ))}
    </div>
  );
}

function EventRow({ e, fmt }: { e: AuditEvent; fmt: (n: number) => string }) {
  const [open, setOpen] = useState(false);
  const deleted = e.action === "expense_deleted";
  const prev = obj(e.previous_values), next = obj(e.new_values);
  const before = asAllocs(e.allocation_before), after = asAllocs(e.allocation_after);
  const expandable = !!(e.previous_values || e.new_values || before.length || after.length);
  const title = deleted ? String(prev.description ?? "") : "";

  return (
    <div className="glass-card p-3" data-testid="audit-event">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", tone(e.action))}>{label(e.action)}</Badge>
            {deleted && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/40 text-destructive">DELETED</Badge>}
          </div>
          {deleted ? (
            <>
              <p className="text-sm font-medium">
                <s className="text-muted-foreground">{title}</s> — <span>{fmt(Number(prev.amount ?? 0))}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deleted by {e.actor_name ?? "Someone"} · {format(parseISO(e.created_at), "d MMM, h:mm a")}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm break-words">{e.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(e.created_at), "d MMM yyyy, h:mm a")}</p>
            </>
          )}
        </div>
        {expandable && (
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setOpen((v) => !v)} aria-label={open ? "Hide details" : "Show details"}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {(e.previous_values || e.new_values) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="font-semibold text-muted-foreground mb-1">Before</p>{Object.entries(prev).map(([k, v]) => <p key={k} className="break-words"><span className="text-muted-foreground">{k}:</span> {String(v ?? "—")}</p>)}</div>
              <div><p className="font-semibold text-muted-foreground mb-1">After</p>{Object.entries(next).map(([k, v]) => <p key={k} className="break-words"><span className="text-muted-foreground">{k}:</span> {String(v ?? "—")}</p>)}</div>
            </div>
          )}
          <AllocTable title={deleted ? "Allocation at deletion" : "Allocation before"} rows={before} fmt={fmt} />
          <AllocTable title="Allocation after" rows={after} fmt={fmt} />
        </div>
      )}
    </div>
  );
}

export function GroupAuditTab({ groupId, members, formatCurr }: { groupId: string; members: GroupMember[]; formatCurr: (n: number) => string }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [actorId, setActorId] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // simple debounce without extra deps
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters: AuditFilters = useMemo(
    () => ({ search: debounced || undefined, actorId: actorId === ALL ? undefined : actorId, action: action === ALL ? undefined : action, from: from || undefined, to: to || undefined }),
    [debounced, actorId, action, from, to]
  );
  const q = useGroupAudit(groupId, filters);
  const events = flattenAudit(q.data?.pages);
  const actors = members.filter((m) => m.member_user_id);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or description" className="pl-8 bg-secondary border-border" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={actorId} onValueChange={setActorId}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Participant" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value={ALL}>All participants</SelectItem>
            {actors.map((m) => <SelectItem key={m.id} value={m.member_user_id!}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Action" /></SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value={ALL}>All actions</SelectItem>
            {AUDIT_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-secondary border-border" aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-secondary border-border" aria-label="To date" />
      </div>

      {q.isPending ? (
        <div className="space-y-2" data-testid="audit-skeleton">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : q.isError ? (
        <div className="glass-card p-4 text-center space-y-2">
          <p className="text-sm text-destructive">Couldn't load the audit history.</p>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} className="gap-1"><RotateCcw className="h-3.5 w-3.5" /> Retry</Button>
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No audit events match these filters.</p>
      ) : (
        <>
          {events.map((e) => <EventRow key={e.id} e={e} fmt={formatCurr} />)}
          {q.hasNextPage && (
            <Button variant="outline" className="w-full border-border" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {q.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
