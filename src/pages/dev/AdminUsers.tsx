import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminUserList, useAdminBlockUser, useAdminUnblockUser, AdminUserRow } from "@/hooks/useAdminUsers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, ShieldBan, ShieldCheck, MessageCircle, Clock } from "lucide-react";

const DURATION_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "Permanent (10 years)", hours: 87600 },
  { label: "Custom", hours: -1 },
];

function BlockDialog({ user, onOpenChange }: { user: AdminUserRow; onOpenChange: (o: boolean) => void }) {
  const blockUser = useAdminBlockUser();
  const [preset, setPreset] = useState("24");
  const [customHours, setCustomHours] = useState("");

  const hours = preset === "-1" ? Number(customHours) || 0 : Number(preset);

  const handleConfirm = () => {
    if (hours <= 0) return;
    blockUser.mutate(
      { userId: user.user_id, hours },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-heading">Block {user.display_name || user.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Block duration</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                {DURATION_PRESETS.map((p) => (
                  <SelectItem key={p.hours} value={String(p.hours)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "-1" && (
            <div>
              <Label>Hours</Label>
              <Input type="number" min="1" value={customHours} onChange={(e) => setCustomHours(e.target.value)} className="bg-secondary border-border" placeholder="e.g. 48" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            They'll still be able to log in, but will see a countdown until they can use the app again.
          </p>
          <Button onClick={handleConfirm} disabled={hours <= 0 || blockUser.isPending} className="w-full" variant="destructive">
            Block for {hours > 0 ? `${hours}h` : "..."}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useAdminUserList();
  const unblockUser = useAdminUnblockUser();
  const [blockTarget, setBlockTarget] = useState<AdminUserRow | null>(null);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => navigate("/dev")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-heading font-bold text-2xl flex-1">All Users</h1>
        <Badge variant="outline" className="border-border">{users.length}</Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const isBlocked = u.blocked_until && new Date(u.blocked_until).getTime() > Date.now();
            return (
              <div key={u.user_id} className="glass-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{u.display_name || "Unnamed"} {u.is_developer && <Badge className="ml-1 bg-primary/20 text-primary">dev</Badge>}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}{u.username ? ` · @${u.username}` : ""}</p>
                  </div>
                  {isBlocked ? (
                    <Badge variant="destructive" className="shrink-0">Blocked</Badge>
                  ) : (
                    <Badge variant="outline" className="border-success text-success shrink-0">Active</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last online: {u.last_seen_at ? formatDistanceToNow(new Date(u.last_seen_at), { addSuffix: true }) : "never"}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {u.chat_rate_per_day}/day · {u.chat_messages_sent} total
                  </span>
                  <span>Joined {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</span>
                </div>

                {isBlocked && (
                  <p className="text-xs text-destructive">
                    Blocked until {new Date(u.blocked_until!).toLocaleString()}
                  </p>
                )}

                <div className="flex justify-end">
                  {isBlocked ? (
                    <Button size="sm" variant="outline" className="gap-1.5 border-success text-success" onClick={() => unblockUser.mutate(u.user_id)}>
                      <ShieldCheck className="h-3.5 w-3.5" /> Unblock
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5 border-destructive text-destructive" disabled={u.is_developer} onClick={() => setBlockTarget(u)}>
                      <ShieldBan className="h-3.5 w-3.5" /> Block
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {blockTarget && <BlockDialog user={blockTarget} onOpenChange={(o) => !o && setBlockTarget(null)} />}
    </div>
  );
}
