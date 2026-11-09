import { PackageOpen, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  /** Tighter padding for use inside a card or list. */
  compact?: boolean;
}

export function EmptyState({ title, description, actionLabel, onAction, icon: Icon = PackageOpen, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-8" : "py-16"}`}>
      <div className="mb-4 rounded-xl bg-primary/10 p-3.5 text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="mb-1 font-heading text-base font-semibold">{title}</h3>
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
