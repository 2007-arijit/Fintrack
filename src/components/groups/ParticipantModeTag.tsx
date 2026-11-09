import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ParticipantModeTag({ mode, memberCount, className }: { mode: "solo" | "family"; memberCount: number; className?: string }) {
  const family = mode === "family";
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 font-semibold tracking-wide", family ? "border-primary/50 text-primary" : "border-border text-muted-foreground", className)}
    >
      {family ? `FAMILY MODE · ${memberCount}` : "SOLO MODE"}
    </Badge>
  );
}
