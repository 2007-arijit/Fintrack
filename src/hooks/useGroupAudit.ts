import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Json } from "@/integrations/supabase/types";
import { auditKey } from "@/hooks/useGroupExpenses";

export interface AuditEvent {
  id: string;
  group_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  previous_values: Json | null;
  new_values: Json | null;
  allocation_before: Json | null;
  allocation_after: Json | null;
  created_at: string;
}

export interface AuditFilters {
  actorId?: string;
  action?: string;
  from?: string; // yyyy-MM-dd (local day, inclusive)
  to?: string;
  search?: string;
}

export const AUDIT_PAGE_SIZE = 20;

export const AUDIT_ACTIONS: { value: string; label: string }[] = [
  { value: "expense_created", label: "Added" },
  { value: "expense_updated", label: "Edited" },
  { value: "expense_deleted", label: "Deleted" },
  { value: "expense_restored", label: "Restored" },
  { value: "visibility_changed", label: "Visibility" },
  { value: "division_mode_changed", label: "Division mode" },
  { value: "payer_changed", label: "Payer" },
  { value: "settlement_created", label: "Settlement" },
  { value: "settlement_deleted", label: "Settlement removed" },
  { value: "member_joined", label: "Joined" },
  { value: "member_added", label: "Member added" },
  { value: "member_removed", label: "Removed" },
  { value: "participant_mode_changed", label: "Solo/Family" },
  { value: "member_count_changed", label: "Member count" },
  { value: "participant_renamed", label: "Renamed" },
  { value: "participant_members_updated", label: "Family names" },
  { value: "group_settings_changed", label: "Group settings" },
  { value: "admin_changed", label: "Admin" },
  { value: "invite_created", label: "Invite" },
  { value: "invite_revoked", label: "Invite revoked" },
];

const escapeLike = (s: string) => s.replace(/[\\%_,()]/g, (c) => `\\${c}`);

/**
 * Keyset-paginated audit feed (newest first). The page cursor is (created_at, id)
 * so concurrent inserts can neither duplicate nor skip rows, and rows are de-duplicated
 * by id when pages are flattened. Only ever loads AUDIT_PAGE_SIZE rows at a time.
 */
export function useGroupAudit(groupId: string | undefined, filters: AuditFilters) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: [...auditKey(groupId), filters],
    enabled: !!user && !!groupId,
    gcTime: 60_000,
    initialPageParam: null as { created_at: string; id: string } | null,
    queryFn: async ({ pageParam, signal }) => {
      let q = supabase
        .from("group_audit_events")
        .select("*")
        .eq("group_id", groupId!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(AUDIT_PAGE_SIZE + 1);
      if (filters.actorId) q = q.eq("actor_id", filters.actorId);
      if (filters.action) q = q.eq("action", filters.action);
      if (filters.from) q = q.gte("created_at", new Date(`${filters.from}T00:00:00`).toISOString());
      if (filters.to) q = q.lte("created_at", new Date(`${filters.to}T23:59:59.999`).toISOString());
      if (filters.search?.trim()) q = q.ilike("description", `%${escapeLike(filters.search.trim())}%`);
      if (pageParam) {
        q = q.or(`created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`);
      }
      const { data, error } = await q.abortSignal(signal);
      if (error) throw error;
      const rows = (data ?? []) as AuditEvent[];
      const hasMore = rows.length > AUDIT_PAGE_SIZE;
      const page = hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;
      const last = page[page.length - 1];
      return { rows: page, next: hasMore && last ? { created_at: last.created_at, id: last.id } : null };
    },
    getNextPageParam: (last) => last.next,
  });
}

export function flattenAudit(pages: { rows: AuditEvent[] }[] | undefined): AuditEvent[] {
  const seen = new Set<string>();
  const out: AuditEvent[] = [];
  for (const p of pages ?? []) for (const r of p.rows) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  return out;
}
