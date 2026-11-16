import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GroupMember } from "@/hooks/useGroups";
import { ParticipantModeFields, ParticipantDraft, draftError, draftCount, draftNames } from "./ParticipantModeFields";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member: GroupMember | null;
  pending?: boolean;
  onSave: (v: { memberId: string; name: string; mode: "solo" | "family"; memberCount: number; memberNames: string[] }) => void;
}

export function EditParticipantDialog({ open, onOpenChange, member, pending, onSave }: Props) {
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<ParticipantDraft>({ mode: "solo", memberCount: "1", memberNames: "" });

  useEffect(() => {
    if (open && member) {
      setName(member.name);
      setDraft({ mode: member.participation_mode, memberCount: String(member.member_count), memberNames: (member.member_names ?? []).join(", ") });
    }
  }, [open, member]);

  if (!member) return null;
  const err = draftError(draft);
  const canSave = name.trim().length > 0 && !err && !pending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Edit participant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{draft.mode === "family" ? "Family name" : "Display name"} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border" />
          </div>
          <ParticipantModeFields value={draft} onChange={setDraft} />
          <p className="text-xs text-muted-foreground">
            Existing expenses keep the member count they were calculated with. Changes only apply to expenses you add or re-split afterwards.
          </p>
          <Button
            className="w-full"
            disabled={!canSave}
            onClick={() => onSave({ memberId: member.id, name: name.trim(), mode: draft.mode, memberCount: draftCount(draft), memberNames: draftNames(draft) })}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
