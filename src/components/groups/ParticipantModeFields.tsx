import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { validateParticipant } from "@/lib/splitEngine";

export interface ParticipantDraft {
  mode: "solo" | "family";
  memberCount: string;
  memberNames: string;
}

export function draftError(d: ParticipantDraft): string | null {
  const count = d.mode === "solo" ? 1 : Number(d.memberCount);
  const err = validateParticipant({ mode: d.mode, memberCount: count });
  if (err) return err;
  const names = d.memberNames.split(",").map((n) => n.trim()).filter(Boolean);
  if (names.length > count) return "More names than members";
  return null;
}
export const draftNames = (d: ParticipantDraft) => d.memberNames.split(",").map((n) => n.trim()).filter(Boolean);
export const draftCount = (d: ParticipantDraft) => (d.mode === "solo" ? 1 : Number(d.memberCount));

export function ParticipantModeFields({ value, onChange }: { value: ParticipantDraft; onChange: (v: ParticipantDraft) => void }) {
  const err = draftError(value);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["solo", "family"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...value, mode: m, memberCount: m === "family" && Number(value.memberCount) < 2 ? "2" : value.memberCount })}
            className={cn("rounded-lg border px-3 py-2 text-left text-sm transition-colors", value.mode === m ? "border-primary bg-primary/10" : "border-border bg-secondary")}
          >
            <p className="font-semibold">{m === "solo" ? "Solo Mode" : "Family Mode"}</p>
            <p className="text-xs text-muted-foreground">{m === "solo" ? "Just me — one person" : "My account represents several people"}</p>
          </button>
        ))}
      </div>
      {value.mode === "family" && (
        <>
          <div>
            <Label>People in your family *</Label>
            <Input type="number" inputMode="numeric" min={2} step={1} value={value.memberCount} onChange={(e) => onChange({ ...value, memberCount: e.target.value })} className="bg-secondary border-border" />
          </div>
          <div>
            <Label>Member names (optional, comma-separated)</Label>
            <Input value={value.memberNames} onChange={(e) => onChange({ ...value, memberNames: e.target.value })} className="bg-secondary border-border" placeholder="Asha, Ravi, Meera" />
          </div>
        </>
      )}
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
