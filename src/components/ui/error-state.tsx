import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Inline failure message with an optional retry. Use instead of leaving a section blank. */
export function ErrorState({ title = "Something went wrong", description, onRetry, retrying, className = "" }: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-3 px-4 py-10 text-center ${className}`}>
      <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <p className="font-heading font-semibold">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} loading={retrying}>
          {!retrying && <RotateCw />} Try again
        </Button>
      )}
    </div>
  );
}
