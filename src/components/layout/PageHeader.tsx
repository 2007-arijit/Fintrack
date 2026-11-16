import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Small uppercase label above the title. Use for period, section or context. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Primary and secondary actions, rendered on the right on desktop. */
  actions?: ReactNode;
  /** Optional back affordance. */
  backTo?: string;
  backLabel?: string;
  className?: string;
}

/**
 * One consistent editorial header for every application page.
 * Title in Fraunces, supporting copy in Manrope, actions aligned right.
 * On mobile the actions wrap beneath the title instead of squeezing it.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backTo,
  backLabel = "Back",
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {backTo && (
          <Link
            to={backTo}
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        )}
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="page-title text-balance">{title}</h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground text-balance">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
