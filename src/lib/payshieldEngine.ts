export type InputKind = "message" | "url" | "upi";
export type Finding = {
  title: string;
  detail: string;
  severity: "high" | "medium" | "info";
  evidence?: string;
  category?: "impersonation" | "lure" | "credential" | "technical" | "coercion";
};
export type ScanResult = {
  id: string;
  createdAt: string;
  ts: number;
  kind: InputKind;
  risk: "high" | "medium" | "low";
  score: number;
  findings: Finding[];
  preview: string;
  aiSummary?: string;
  aiUsed?: boolean;
  attackVector?: string;
  preventativeAdvice?: string[];
};

export function detectInputKind(text: string): InputKind {
  const trimmed = text.trim();
  if (!trimmed) return "message";
  if (/^upi:\/\/pay/i.test(trimmed) || /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(trimmed)) {
    return "upi";
  }
  if (/^(https?:\/\/|www\.)[^\s<>"']+$/i.test(trimmed) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<>"']*)?$/i.test(trimmed)) {
    return "url";
  }
  return "message";
}

export const rules: Array<{ pattern: RegExp; title: string; detail: string; severity: Finding["severity"] }> = [
  { pattern: /\b(urgent|immediately|right now|within \d+ minutes?|act fast|last chance)\b/i, title: "Pressure or urgency", detail: "Scam messages often pressure people to act before they can verify the request.", severity: "medium" },
  { pattern: /\b(otp|one.time.password|pin|upi pin|password| cvv )\b/i, title: "Requests for secret credentials", detail: "Never share an OTP, UPI PIN, password, or card security code with another person.", severity: "high" },
  { pattern: /\b(refund|cashback|prize|lottery|reward|won|winner|claim)\b/i, title: "Unexpected reward or refund", detail: "Unexpected rewards and refunds can be used to lure people into sharing details or approving a payment.", severity: "medium" },
  { pattern: /\b(scan (the )?qr|receive money|collect payment|approve request|payment request)\b/i, title: "Unusual payment instruction", detail: "A QR scan or payment approval may send money; it is not required just to receive money.", severity: "high" },
  { pattern: /\b(install|download).{0,35}\b(app|application|screen.?sharing|remote access|apk)\b/i, title: "App installation or remote access", detail: "Unrequested apps, APKs, or screen-sharing access can expose financial information.", severity: "high" },
  { pattern: /\b(anydesk|teamviewer|rustdesk|quicksupport|airdroid|screenshare)\b/i, title: "Remote control tool requested", detail: "Scammers often direct victims to install remote desktop tools to silently capture OTPs and banking credentials.", severity: "high" },
  { pattern: /\b(keep (this )?secret|don't tell|do not tell|confidential|do not disconnect|remain on call)\b/i, title: "Secrecy or isolation demand", detail: "Demanding that you keep a matter confidential or stay isolated on a call is a hallmark of high-pressure social engineering.", severity: "medium" },
  { pattern: /\b(block(ed)?|suspend(ed)?|deactivat(e|ed|ion)|disconnect(ed|ion)?|power.?cut|power.?supply|electricity.?bill|gas.?supply)\b/i, title: "Account threat or utility disconnection threat", detail: "Threats about immediate account suspension or utility disconnection (power cut) are common scare tactics. Verify status exclusively through official apps or bills, not via messages.", severity: "high" },
  { pattern: /\b(overdue|past due|default(ed)?|credit bureau|cibil|legal action|recovery|penalt(y|ies))\b/i, title: "Debt or credit-report pressure", detail: "Messages about overdue payments or credit-bureau reports are a common scare tactic. Check your loan status in the lender's official app or branch, not through a message link.", severity: "medium" },
  { pattern: /\b(digital arrest|cbi|central bureau of investigation|enforcement directorate|\b(ed|trai)\b|cyber crime cell|mha|narcotics|customs department|supreme court|arrest warrant|fir registered|police station|video call verification|asset verification)\b/i, title: "Coercion or fake legal authority ('Digital Arrest')", detail: "Legitimate police, CBI, or customs agencies NEVER conduct 'digital arrests', demand video call isolation, or ask citizens to transfer funds to 'RBI verification accounts'.", severity: "high" },
  { pattern: /\b(india.?post|bluedart|delhivery|fedex|dtdc|courier|parcel|shipment|consignment).{0,50}\b(address|redelivery|reschedule|undelivered|hold|suspended|update details|failed delivery)\b/i, title: "Courier / parcel delivery lure (Smishing)", detail: "Messages alleging a delivery failure due to an incorrect address or requiring a small payment (₹25–₹50) are classic credential-harvesting phishing lures.", severity: "high" },
  { pattern: /\b(part.?time|daily.?income|per.?day|task.?based|like.?youtube|rating.?job|earn \d+|telegram.?job|crypto.?investment|vip.?plan|guaranteed return)\b/i, title: "Part-time task or high-return investment trap", detail: "Guaranteed daily payouts for simple online tasks (liking videos, hotel reviews) or crypto schemes are advance-fee fraud models.", severity: "high" },
  { pattern: /\b(telegram.?(channel|group|job|task)|whatsapp.?(group|task)|work.?from.?home|wfh|submit.?screenshot)\b/i, title: "Unsolicited task platform or private channel lure", detail: "Scammers redirect victims to private Telegram or WhatsApp groups where bot-driven fake testimonials convince victims to deposit funds.", severity: "medium" },
  { pattern: /\b(enter.?pin to receive|pin to credit|scan.?to.?receive|pay.?request to receive|receive.?advance|approve to get|accept to receive|payee pin)\b/i, title: "Inverted UPI collect request trick", detail: "CRITICAL: You NEVER enter your UPI PIN or approve a request to receive money. Entering a PIN strictly and exclusively DEBITS funds from your account.", severity: "high" },
  { pattern: /\b(echallan|e-challan|traffic.?fine|traffic.?police|impound|court.?hearing|vehicle.?blacklisted)\b/i, title: "Traffic e-Challan / impound threat", detail: "Fake e-challan notifications trick drivers into downloading malicious APKs or visiting fake payment portals. Always verify fines on parivahan.gov.in directly.", severity: "medium" },
];

export const OFFICIAL_BRAND_DOMAINS: Array<{ brand: string; display: string; official: string[] }> = [
  { brand: "phonepe", display: "PhonePe", official: ["phonepe.com"] },
  { brand: "paytm", display: "Paytm", official: ["paytm.com"] },
  { brand: "sbi", display: "SBI (State Bank of India)", official: ["sbi.co.in", "onlinesbi.sbi", "sbi.bank"] },
  { brand: "hdfc", display: "HDFC Bank", official: ["hdfcbank.com"] },
  { brand: "icici", display: "ICICI Bank", official: ["icicibank.com"] },
  { brand: "axis", display: "Axis Bank", official: ["axisbank.com"] },
  { brand: "kotak", display: "Kotak Mahindra Bank", official: ["kotak.com"] },
  { brand: "pnb", display: "Punjab National Bank", official: ["pnbindia.in"] },
  { brand: "rbi", display: "RBI (Reserve Bank of India)", official: ["rbi.org.in"] },
  { brand: "irctc", display: "IRCTC", official: ["irctc.co.in"] },
  { brand: "uidai", display: "UIDAI (Aadhaar)", official: ["uidai.gov.in"] },
  { brand: "aadhaar", display: "Aadhaar", official: ["uidai.gov.in"] },
  { brand: "indiapost", display: "India Post", official: ["indiapost.gov.in"] },
  { brand: "post", display: "Postal Service", official: ["indiapost.gov.in", "gov.in"] },
  { brand: "npci", display: "NPCI", official: ["npci.org.in"] },
  { brand: "amazon", display: "Amazon", official: ["amazon.in", "amazon.com"] },
  { brand: "netflix", display: "Netflix", official: ["netflix.com"] },
  { brand: "googlepay", display: "Google Pay", official: ["google.com"] },
  { brand: "gpay", display: "Google Pay", official: ["google.com"] },
  { brand: "electricity", display: "Electricity Department", official: [".gov.in"] },
  { brand: "discom", display: "Discom / Utility", official: [".gov.in"] },
];

export function analyzeInput(raw: string, kind: InputKind): Omit<ScanResult, "id" | "createdAt" | "ts" | "kind" | "preview"> {
  const findings: Finding[] = [];
  // Clean defanged indicators like [.] or (.) and normalize scheme
  const cleanRaw = raw
    .trim()
    .replace(/\[\.\]|\(\.\)/g, ".")
    .replace(/^hxxps?:\/\//i, (m) => m.toLowerCase().replace("hxxp", "http"));

  if (kind === "message") {
    for (const rule of rules) {
      const match = cleanRaw.match(rule.pattern);
      if (match) findings.push({ ...rule, evidence: match[0].trim() });
    }
  }

  const urls = cleanRaw.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi) ?? [];
  const evaluateUrl = (candidate: string) => {
    const normalized = candidate.startsWith("www.") ? `http://${candidate}` : candidate;
    try {
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      const pathAndQuery = (parsed.pathname + parsed.search).toLowerCase();

      if (parsed.protocol !== "https:") {
        findings.push({ title: "Unencrypted link", detail: "This link does not use HTTPS. Do not enter personal or payment information unless you independently verify the official site.", severity: "medium", evidence: candidate });
      }
      if (/(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|rb\.gy)$/i.test(host)) {
        findings.push({ title: "Shortened link", detail: "The destination is hidden behind a link shortener. Verify the full destination independently before opening it.", severity: "medium", evidence: candidate });
      }
      if (host.startsWith("xn--") || host.split(".").some((part) => part.startsWith("xn--"))) {
        findings.push({ title: "Internationalized domain", detail: "The domain uses encoded characters. Check carefully for look-alike spelling and verify the official domain.", severity: "medium", evidence: host });
      }
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        findings.push({ title: "Link uses an IP address", detail: "A payment or account link that uses a raw IP address deserves extra verification.", severity: "high", evidence: host });
      }
      if (parsed.username || parsed.password) {
        findings.push({ title: "Link contains embedded login details", detail: "Do not open links that embed credentials or unexpected text before the domain.", severity: "high", evidence: candidate });
      }

      // Check synthetic / invalid TLDs
      if (host.endsWith(".invalid") || host.endsWith(".test") || host.endsWith(".localhost") || host.endsWith(".example")) {
        findings.push({
          title: "Synthetic or invalid domain extension",
          detail: "The domain uses a reserved or test top-level domain (.invalid/.test). It is not an authentic public service website.",
          severity: "high",
          evidence: host,
        });
      }

      // Check abuse of free cloud hosting services for financial/KYC phishing
      const FREE_CLOUD_PLATFORMS = /(pages\.dev|web\.app|firebaseapp\.com|vercel\.app|workers\.dev|glitch\.me|render\.com|ngrok-free\.app|s3\.amazonaws\.com|blob\.core\.windows\.net|github\.io|gitlab\.io)$/i;
      if (FREE_CLOUD_PLATFORMS.test(host)) {
        const hasLure = (host + pathAndQuery).match(/(sbi|hdfc|icici|axis|pnb|paytm|phonepe|gpay|bank|kyc|pan|aadhaar|refund|support|login|secure|verify|update|claim|bill|challan)/i);
        if (hasLure) {
          findings.push({
            title: "Suspicious financial portal on free cloud hosting",
            detail: `This link is hosted on a free cloud service (${host}) rather than an official institutional domain. Real banks and government agencies NEVER host financial portals on free public subdomains.`,
            severity: "high",
            evidence: host,
          });
        }
      }

      // Check brand impersonation in host
      for (const item of OFFICIAL_BRAND_DOMAINS) {
        if (host.includes(item.brand)) {
          const isOfficial = item.official.some((d) => host === d || host.endsWith("." + d));
          if (!isOfficial) {
            findings.push({
              title: "Suspected brand or service impersonation",
              detail: `The link domain mentions ${item.display} but is not an official domain (${item.official.join(", ")}). Fraudsters register look-alike domains to deceive users.`,
              severity: "high",
              evidence: host,
            });
            break;
          }
        }
      }

      // Check reward, refund, cashback, or waiver lure in URL
      const lureMatch = (host + pathAndQuery).match(/\b(cashback|reward|rewards|reward-center|winner|prize|lottery|refund|ticket-refund|quickrefund|subsidy|waiver|claim|bonus)\b/i);
      if (lureMatch) {
        findings.push({
          title: "Reward or refund lure in link",
          detail: "The web address promises cashback, rewards, refunds, or prizes. Genuine financial institutions and merchants do not ask you to visit unverified links to claim money.",
          severity: "high",
          evidence: lureMatch[0],
        });
      }

      // Check sensitive actions requested in URL (login, verify, pay, kyc, aadhaar)
      const actionMatch = (host + pathAndQuery).match(/\b(aadhaar-update|pan-link|kyc-update|account-alert|urgent-verify|verify|login|signin|sign-in|status|pay|payment|electricity-bill-waiver|bill-waiver|disconnect)\b/i);
      if (actionMatch) {
        findings.push({
          title: "Sensitive action requested in link",
          detail: "The link directs to an unverified verification, login, or payment action. Always navigate directly through the official app or website instead of opening external links.",
          severity: "medium",
          evidence: actionMatch[0],
        });
      }
    } catch {
      findings.push({ title: "Link could not be parsed", detail: "The link format is unusual. Do not open it until you verify the destination.", severity: "medium", evidence: candidate });
    }
  };

  for (const candidate of urls) {
    evaluateUrl(candidate);
  }

  if (kind === "message") {
    const bareLinks = cleanRaw.match(/(?<![@\w./-])(?:[a-z0-9-]+\.)+(?:com|in|net|org|co|info|xyz|top|online|site|link|app|club|icu|vip|live|shop|bank)(?:\/[^\s<>"']*)?(?![\w@-])/gi) ?? [];
    for (const bare of bareLinks) {
      if (urls.some((u) => u.includes(bare))) continue;
      findings.push({ title: "Web address without a verified source", detail: "The message tells you to visit an address you cannot verify from the text. Get a bank's website from its official app, card or statement, not from a message.", severity: "medium", evidence: bare });
    }
  }

  if (kind === "url" && urls.length === 0 && cleanRaw) {
    evaluateUrl(cleanRaw.startsWith("www.") ? `https://${cleanRaw}` : (cleanRaw.includes("://") ? cleanRaw : `https://${cleanRaw}`));
  }

  if (kind === "upi") {
    const upi = cleanRaw.replace(/^upi:\/\/pay\?/i, "").match(/(?:^|[?&])pa=([^&]+)/i)?.[1] ?? cleanRaw;
    const looksLikeUpi = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upi);
    if (!looksLikeUpi) {
      findings.push({ title: "UPI ID format not recognized", detail: "Check the spelling and format. A valid-looking UPI ID still does not prove who owns it.", severity: "info", evidence: upi });
    } else {
      const [handle, provider] = upi.toLowerCase().split("@");

      // 1. Fake Customer Support / Helpdesk / Care / Nodal / Officer Impersonation
      if (/(helpdesk|support|customer\.care|customercare|care|helpline|tollfree|service|nodal|complaint|dispute|reversal|security|officer|billing|executive)/i.test(handle)) {
        findings.push({
          title: "Fake support, nodal, or authority UPI handle",
          detail: "Official customer support, dispute resolution teams, and nodal officers NEVER accept UPI transfers from individuals. This is a common payment diversion scam.",
          severity: "high",
          evidence: handle,
        });
      }

      // 2. Refund, Reward, Subsidy, or Lottery Lure
      if (/(refund|quickrefund|cashback|reward|prize|winner|claim|subsidy|lottery|bonus|waiver)/i.test(handle)) {
        findings.push({
          title: "Refund, reward, or subsidy lure in UPI ID",
          detail: "You NEVER need to send money or approve a UPI collect request to receive a refund, prize, or subsidy. Fraudulent UPI handles frequently use names like 'refund' or 'subsidy' to trick victims.",
          severity: "high",
          evidence: handle,
        });
      }

      // 3. Brand or Institution Impersonation
      if (/(sbi|paytm|phonepe|npci|amazon|rbi|irctc|govt|googlepay|gpay|income.?tax|airtel|jio|bsnl|lic|epfo|axis|hdfc|icici|kotak|pnb|bob|netflix)/i.test(handle)) {
        findings.push({
          title: "Suspected brand or authority impersonation in UPI ID",
          detail: "This UPI ID mimics an official institution or brand name. Official organizations do not accept payments via informal or look-alike personal UPI handles.",
          severity: "high",
          evidence: handle,
        });
      }

      // 4. Dispute or Fraud Reversal Impersonation
      if (/(dispute|reversal|chargeback|grievance|fraud)/i.test(handle)) {
        findings.push({
          title: "Fake dispute or fraud reversal handle",
          detail: "Banks and payment apps never ask users to transfer funds to 'reversal' or 'dispute' UPI handles to recover lost money or resolve complaints.",
          severity: "high",
          evidence: handle,
        });
      }

      // 5. Autopay / Mandate Traps in UPI Handle
      if (/(autopay|mandate|sub_charge|emi_auto|recurring)/i.test(handle)) {
        findings.push({
          title: "Deceptive recurring autopay or mandate handle",
          detail: "Approving requests or sending funds to mandate/autopay handles may trigger unauthorized periodic deductions.",
          severity: "high",
          evidence: handle,
        });
      }

      // 5. Synthetic or Invalid Provider Handle
      if (provider === "invalid" || provider === "test" || provider === "example" || provider === "localhost") {
        findings.push({
          title: "Synthetic or invalid UPI provider",
          detail: `The handle extension (@${provider}) is a reserved or fake domain and not a registered banking or UPI Payment Service Provider.`,
          severity: "medium",
          evidence: `@${provider}`,
        });
      } else {
        findings.push({
          title: "UPI ID ownership not verified",
          detail: "This prototype checks format and known risk indicators. It cannot verify the registered account holder, beneficiary name, or live bank reputation.",
          severity: "info",
          evidence: upi,
        });
      }
    }
  }

  const unique = findings.filter((item, index, all) => all.findIndex((other) => other.title === item.title && other.evidence === item.evidence) === index);
  const score = Math.min(10, unique.reduce((sum, item) => sum + (item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 0), 0));
  const risk = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { findings: unique, score, risk };
}
