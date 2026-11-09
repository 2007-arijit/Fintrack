import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, MinusCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const config: Record<StatusTone, { variant: "success" | "warning" | "danger" | "info" | "secondary"; icon: LucideIcon }> = {
  success: { variant: "success", icon: CheckCircle2 },
  warning: { variant: "warning", icon: AlertTriangle },
  danger: { variant: "danger", icon: ShieldAlert },
  info: { variant: "info", icon: Info },
  neutral: { variant: "secondary", icon: MinusCircle },
};

/** Status chip that never relies on colour alone: every tone carries an icon and a text label. */
export function StatusBadge({ tone, children, icon, className }: {
  tone: StatusTone;
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const { variant, icon: DefaultIcon } = config[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <Badge variant={variant} className={className}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </Badge>
  );
}
