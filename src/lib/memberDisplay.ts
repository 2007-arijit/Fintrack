import { GroupMember } from "@/hooks/useGroups";

/**
 * Renders a group member's name from the current viewer's perspective:
 * whichever member row is linked to *your* account shows as "You", and
 * everyone else shows their real name. Every member's `name` in the
 * database is always their real name — "You" is a display-only label,
 * never stored — so the same group looks correct from every member's
 * own account.
 */
export function memberDisplayName(member: GroupMember | undefined | null, currentUserId?: string | null): string {
  if (!member) return "Unknown";
  if (currentUserId && member.member_user_id === currentUserId) return "You";
  return member.name;
}
