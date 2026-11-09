import type { StatusTone } from "@/components/ui/status-badge";

export type RiskLevel = "high" | "medium" | "low";

/** Single source for how a risk level is named and toned, shared by the dashboard card and PayShield.
 *  Wording is deliberately hedged: these are indicators from limited checks, not verdicts. */
export const RISK_META: Record<RiskLevel, { label: string; tone: StatusTone }> = {
  high: { label: "High risk indicators", tone: "danger" },
  medium: { label: "Caution advised", tone: "warning" },
  low: { label: "No obvious warning signs", tone: "success" },
};

export function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "high" || value === "medium" || value === "low";
}
