import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CurrencySelector } from "@/components/CurrencySelector";
import { GROUP_TYPES, Group } from "@/hooks/useGroups";
import { useFriends } from "@/hooks/useFriends";
import { CurrencyCode } from "@/lib/formatCurrency";
import { cn } from "@/lib/utils";
import { Check, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";

interface CreateGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: CurrencyCode;
  onSubmit: (data: {
    name: string;
    group_type: Group["group_type"];
    currency: CurrencyCode;
    friends: { userId: string; name: string }[];
  }) => void;
}

export function CreateGroupModal({ open, onOpenChange, defaultCurrency, onSubmit }: CreateGroupModalProps) {
  const { friends } = useFriends();
  const [name, setName] = useState("");
  const [groupType, setGroupType] = useState<Group["group_type"]>("friends");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [selected, setSelected] = useState<string[]>([]);

  const reset = () => {
    setName("");
    setGroupType("friends");
    setCurrency(defaultCurrency);
    setSelected([]);
  };

  const toggleFriend = (userId: string) => {
    setSelected((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const canSubmit = name.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const chosen = friends
      .filter((f) => selected.includes(f.friend_id))
      .map((f) => ({ userId: f.friend_id, name: f.display_name || f.username || "Friend" }));
    onSubmit({ name: name.trim(), group_type: groupType, currency, friends: chosen });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">New Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Group Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-secondary border-border"
              placeholder="Goa Trip, Flat 3B, Weekend Getaway..."
            />
          </div>

          <div>
            <Label>Type</Label>
            <div className="flex gap-2 flex-wrap mt-1">
              {GROUP_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setGroupType(t.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    groupType === t.value ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  )}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Currency</Label>
            <div className="mt-1">
              <CurrencySelector value={currency} onChange={setCurrency} />
            </div>
          </div>

          <div>
            <Label>Members</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Split is a shared feature — everyone you add needs their own FinTrack account. Pick from your friends,
              or invite more people once the group is created.
            </p>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="border-border">You</Badge>
            </div>
            {friends.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-center">
                <p className="text-xs text-muted-foreground mb-2">You have no friends added yet.</p>
                <Link to="/settings" className="text-xs text-primary inline-flex items-center gap-1">
                  <UserPlus className="h-3.5 w-3.5" /> Add friends in Settings
                </Link>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {friends.map((f) => {
                  const isSelected = selected.includes(f.friend_id);
                  return (
                    <button
                      key={f.friend_id}
                      onClick={() => toggleFriend(f.friend_id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1",
                        isSelected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                      {f.display_name || f.username}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={!canSubmit}>
            Create Group
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
