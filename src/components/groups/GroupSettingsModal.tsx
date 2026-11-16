import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Group, GroupMember } from "@/hooks/useGroups";
import { useFriends } from "@/hooks/useFriends";
import { useGroupInvite, inviteUrl } from "@/hooks/useGroupInvite";
import { useAuth } from "@/contexts/AuthContext";
import { memberDisplayName } from "@/lib/memberDisplay";
import { toast } from "sonner";
import { ParticipantModeTag } from "@/components/groups/ParticipantModeTag";
import { Link2, Copy, Ban, Archive, ArchiveRestore, UserPlus, X, ChevronDown, ChevronUp, User, Pencil } from "lucide-react";

interface GroupSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: Group;
  members: GroupMember[];
  isAdmin: boolean;
  onAddMember: (userId: string, name: string) => void;
  onRemoveMember: (memberId: string) => void;
  onEditMember: (memberId: string) => void;
  onArchiveGroup: (archived: boolean) => void;
}

const MEMBER_PREVIEW_COUNT = 3;

export function GroupSettingsModal({
  open,
  onOpenChange,
  group,
  members,
  isAdmin,
  onAddMember,
  onRemoveMember,
  onEditMember,
  onArchiveGroup,
}: GroupSettingsModalProps) {
  const { user } = useAuth();
  const { friends } = useFriends();
  const { invite, createInvite, revokeInvite } = useGroupInvite(open ? group.id : undefined);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);

  const memberUserIds = new Set(members.map((m) => m.member_user_id).filter(Boolean));
  const addableFriends = friends.filter((f) => !memberUserIds.has(f.friend_id));
  const visibleMembers = showAllMembers ? members : members.slice(0, MEMBER_PREVIEW_COUNT);
  const hiddenCount = members.length - MEMBER_PREVIEW_COUNT;

  const copyLink = () => {
    if (!invite) return;
    navigator.clipboard.writeText(inviteUrl(invite.code));
    toast.success("Invite link copied");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border-border max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Group Settings</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                Members <span className="text-xs font-normal">({members.length})</span>
              </h3>
              <div className="space-y-2">
                {visibleMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
                  >
                    <div
                      className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center bg-primary/10"
                      style={{ borderColor: m.color ?? undefined }}
                    >
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {memberDisplayName(m, user?.id)}
                        {m.member_user_id === user?.id && m.name !== "You" && (
                          <span className="text-muted-foreground font-normal"> ({m.name})</span>
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <ParticipantModeTag mode={m.participation_mode} memberCount={m.member_count} />
                        {m.member_names && m.member_names.length > 0 && (
                          <span className="text-[11px] text-muted-foreground truncate">{m.member_names.join(", ")}</span>
                        )}
                      </div>
                    </div>
                    {!group.archived && (isAdmin || m.member_user_id === user?.id) && (
                      <button onClick={() => onEditMember(m.id)} className="shrink-0 text-muted-foreground hover:text-primary" aria-label={`Edit ${m.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {isAdmin && !group.archived && !m.is_you && (
                      <button
                        onClick={() => onRemoveMember(m.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${m.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {hiddenCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full gap-1 text-muted-foreground"
                  onClick={() => setShowAllMembers((v) => !v)}
                >
                  {showAllMembers ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" /> Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" /> View All ({members.length})
                    </>
                  )}
                </Button>
              )}
            </div>

            {isAdmin && !group.archived && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Add from friends</h3>
                {addableFriends.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No friends available to add. Everyone in your friend list is already here, or you haven't added any friends yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {addableFriends.map((f) => (
                      <button
                        key={f.friend_id}
                        onClick={() => onAddMember(f.friend_id, f.display_name || f.username || "Friend")}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> {f.display_name || f.username}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isAdmin && !group.archived && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" /> Invite Link
                </h3>
                {invite ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteUrl(invite.code)}
                        className="flex-1 h-9 rounded-md bg-secondary border border-border px-2 text-xs truncate"
                      />
                      <Button size="icon" variant="outline" className="border-border shrink-0" onClick={copyLink}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive gap-1"
                      onClick={() => revokeInvite.mutate(invite.id)}
                      disabled={revokeInvite.isPending}
                    >
                      <Ban className="h-3.5 w-3.5" /> Revoke link
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Anyone with this link can join the group. They'll need — or be prompted to create — a FinTrack account.
                    </p>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => createInvite.mutate()} disabled={createInvite.isPending} className="gap-1">
                    <Link2 className="h-3.5 w-3.5" /> Create Invite Link
                  </Button>
                )}
              </div>
            )}

            {group.archived && (
              <p className="text-xs text-muted-foreground rounded-lg bg-secondary/50 p-3">
                This group is archived. Its expenses, allocations, settlements, balances, and audit history are preserved and read-only.
              </p>
            )}

            {isAdmin && (
              <>
                <Separator className="bg-border" />
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                    {group.archived ? "Restore Group" : "Archive Group"}
                  </h3>
                  <Button
                    variant={group.archived ? "default" : "outline"}
                    size="sm"
                    className="gap-1"
                    onClick={() => setConfirmArchive(true)}
                  >
                    {group.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    {group.archived ? "Restore Group" : "Archive Group"}
                  </Button>
                </div>
              </>
            )}

            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Only the group admin can manage members, invites, or archive this group.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={group.archived ? "Restore Group?" : "Archive Group?"}
        description={group.archived
          ? "This will return the group to your active groups. Its original expenses, allocations, settlements, and balances will remain unchanged."
          : "This will move the group out of your active groups. All expenses, allocations, settlements, balances, and audit history will be retained. New group activity will be disabled until you restore it."}
        confirmLabel={group.archived ? "Restore Group" : "Archive Group"}
        onConfirm={() => {
          setConfirmArchive(false);
          onOpenChange(false);
          onArchiveGroup(!group.archived);
        }}
      />
    </>
  );
}
