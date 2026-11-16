export const UPI_ID_REGEX = /^[a-zA-Z0-9._-]+@[a-zA-Z][a-zA-Z0-9]*$/;

export function validateUpiId(upi: string): boolean {
  return UPI_ID_REGEX.test(upi.trim());
}

/** Builds a `upi://pay` deep link that opens the user's installed UPI apps. */
export function buildUpiDeepLink(params: {
  upiId: string;
  name: string;
  amount?: number | null;
  note?: string | null;
}): string {
  const url = new URL("upi://pay");
  url.searchParams.set("pa", params.upiId);
  url.searchParams.set("pn", params.name);
  if (params.amount) url.searchParams.set("am", String(params.amount));
  if (params.note) url.searchParams.set("tn", params.note);
  return url.toString();
}
