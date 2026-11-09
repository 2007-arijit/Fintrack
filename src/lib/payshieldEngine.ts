import type { RiskLevel } from "@/lib/payshieldRisk";

// Rule engine extracted unchanged from pages/PayShield.tsx so the page can focus on UI.
// Scoring: high 3, medium 2, note 0 (max 10). 0-1 low, 2-4 caution, 5+ high.

export type InputKind = "message" | "url" | "upi";
export type Finding = { title: string; detail: string; severity: "high" | "medium" | "info"; evidence?: string };

/** off: AI not requested. ok: AI returned a valid assessment. failed: AI was requested but did not return one.
 *  needs_save: AI was requested but skipped because the scan could not be saved first.
 *  Saved history only records ai_used, so rows loaded from the database are "ok" or "off". */
export type AiState = "off" | "ok" | "failed" | "needs_save";

export type ScanResult = {
  id: string;
  createdAt: string; // ISO timestamp
  ts: number;
  kind: InputKind;
  risk: RiskLevel;
  score: number;
  findings: Finding[];
  preview: string;
  aiSummary?: string;
  aiState: AiState;
  /** false when the scan could not be written to the user's history */
  saved: boolean;
};

export const rules: Array<{ pattern: RegExp; title: string; detail: string; severity: Finding["severity"] }> = [
  { pattern: /\b(urgent|immediately|right now|within \d+ minutes?|act fast|last chance)\b/i, title: "Pressure or urgency", detail: "Scam messages often pressure people to act before they can verify the request.", severity: "medium" },
  { pattern: /\b(otp|one.time.password|pin|upi pin|password| cvv )\b/i, title: "Requests for secret credentials", detail: "Never share an OTP, UPI PIN, password, or card security code with another person.", severity: "high" },
  { pattern: /\b(refund|cashback|prize|lottery|reward|won|winner|claim)\b/i, title: "Unexpected reward or refund", detail: "Unexpected rewards and refunds can be used to lure people into sharing details or approving a payment.", severity: "medium" },
  { pattern: /\b(scan (the )?qr|receive money|collect payment|approve request|payment request)\b/i, title: "Unusual payment instruction", detail: "A QR scan or payment approval may send money; it is not required just to receive money.", severity: "high" },
  { pattern: /\b(install|download).{0,35}\b(app|application|screen.?sharing|remote access)\b/i, title: "App installation or remote access", detail: "Unrequested apps or screen-sharing access can expose financial information.", severity: "high" },
  { pattern: /\b(keep (this )?secret|don't tell|do not tell|confidential)\b/i, title: "Secrecy request", detail: "A request to hide a payment or conversation can be a manipulation warning sign.", severity: "medium" },
  { pattern: /\b(block(ed)?|suspend(ed)?|deactivat(e|ed|ion))\b/i, title: "Account-threat language", detail: "Threats about account suspension should be verified through the official app or website, not message links.", severity: "medium" },
  { pattern: /\b(overdue|past due|default(ed)?|credit bureau|cibil|legal action|recovery|penalt(y|ies))\b/i, title: "Debt or credit-report pressure", detail: "Messages about overdue payments or credit-bureau reports are a common scare tactic. Check your loan status in the lender's official app or branch, not through a message link.", severity: "medium" },
];

export function analyzeInput(raw: string, kind: InputKind): Pick<ScanResult, "findings" | "score" | "risk"> {
  const findings: Finding[] = [];
  const value = raw.trim();

  if (kind === "message") {
    for (const rule of rules) {
      const match = value.match(rule.pattern);
      if (match) findings.push({ ...rule, evidence: match[0].trim() });
    }
  }

  const urls = value.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi) ?? [];
  for (const candidate of urls) {
    const normalized = candidate.startsWith("www.") ? `http://${candidate}` : candidate;
    try {
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol !== "https:") findings.push({ title: "Unencrypted link", detail: "This link does not use HTTPS. Do not enter personal or payment information unless you independently verify the official site.", severity: "medium", evidence: candidate });
      if (/(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|rb\.gy)$/i.test(host)) findings.push({ title: "Shortened link", detail: "The destination is hidden behind a link shortener. Verify the full destination independently before opening it.", severity: "medium", evidence: candidate });
      if (host.startsWith("xn--") || host.split(".").some((part) => part.startsWith("xn--"))) findings.push({ title: "Internationalized domain", detail: "The domain uses encoded characters. Check carefully for look-alike spelling and verify the official domain.", severity: "medium", evidence: host });
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) findings.push({ title: "Link uses an IP address", detail: "A payment or account link that uses a raw IP address deserves extra verification.", severity: "high", evidence: host });
      if (parsed.username || parsed.password) findings.push({ title: "Link contains embedded login details", detail: "Do not open links that embed credentials or unexpected text before the domain.", severity: "high", evidence: candidate });
    } catch {
      findings.push({ title: "Link could not be parsed", detail: "The link format is unusual. Do not open it until you verify the destination.", severity: "medium", evidence: candidate });
    }
  }

  if (kind === "message") {
    const bareLinks = value.match(/(?<![@\w.\/-])(?:[a-z0-9-]+\.)+(?:com|in|net|org|co|info|xyz|top|online|site|link|app|club|icu|vip|live|shop|bank)(?:\/[^\s<>"']*)?(?![\w@-])/gi) ?? [];
    for (const bare of bareLinks) {
      if (urls.some((u) => u.includes(bare))) continue;
      findings.push({ title: "Web address without a verified source", detail: "The message tells you to visit an address you cannot verify from the text. Get a bank's website from its official app, card or statement, not from a message.", severity: "medium", evidence: bare });
    }
  }

  if (kind === "url" && urls.length === 0 && value) {
    try {
      const parsed = new URL(value.startsWith("www.") ? `https://${value}` : value);
      if (parsed.protocol !== "https:") findings.push({ title: "Unencrypted link", detail: "This link does not use HTTPS. Verify the official destination before entering information.", severity: "medium", evidence: value });
    } catch {
      findings.push({ title: "Invalid URL format", detail: "Enter a complete web address such as https://example.com. This tool cannot verify a destination from an incomplete address.", severity: "info" });
    }
  }

  if (kind === "upi") {
    const upi = value.replace(/^upi:\/\/pay\?/i, "").match(/(?:^|[?&])pa=([^&]+)/i)?.[1] ?? value;
    const looksLikeUpi = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upi);
    if (!looksLikeUpi) findings.push({ title: "UPI ID format not recognized", detail: "Check the spelling and format. A valid-looking UPI ID still does not prove who owns it.", severity: "info", evidence: upi });
    else findings.push({ title: "UPI ID ownership not verified", detail: "This prototype checks format only. It cannot confirm the account holder, beneficiary name, or whether the ID is reported for fraud.", severity: "info", evidence: upi });
  }

  const unique = findings.filter((item, index, all) => all.findIndex((other) => other.title === item.title && other.evidence === item.evidence) === index);
  const score = Math.min(10, unique.reduce((sum, item) => sum + (item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 0), 0));
  const risk = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { findings: unique, score, risk };
}
