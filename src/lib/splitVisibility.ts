export type Visibility = "group" | "participants";

/** Names who can see a "personal" (participants-only) expense. */
export const PERSONAL_EXPLANATION =
  "Only the members sharing this expense (and whoever paid) can see it. Everyone else won't see it and isn't charged.";

export interface VisibilityChangePlan {
  needsConfirmation: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
}

/** A visibility change changes who can see an expense and its history, so it is never silent. */
export function planVisibilityChange(from: Visibility, to: Visibility): VisibilityChangePlan {
  if (from === to) return { needsConfirmation: false };
  if (to === "participants") {
    return {
      needsConfirmation: true,
      title: "Hide this expense from other members?",
      message:
        "Members who aren't sharing it will no longer see it or its history. Balances stay the same: the people sharing it are still charged their share.",
      confirmLabel: "Hide from others",
    };
  }
  return {
    needsConfirmation: true,
    title: "Make this expense visible to everyone?",
    message: "Every group member will see this expense and its history. Balances stay the same.",
    confirmLabel: "Show to everyone",
  };
}

/** Ids of the members who will be able to see an expense (payer + sharers). */
export function audienceIds(payerId: string, sharerIds: string[]): string[] {
  return [...new Set([payerId, ...sharerIds].filter(Boolean))];
}
