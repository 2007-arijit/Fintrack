import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clipboard, FileText, History,
  Info, Link2, LockKeyhole, ScanSearch, ShieldAlert, ShieldCheck, Sparkles, Trash2,
} from "lucide-react";

type InputKind = "message" | "url" | "upi";
type Finding = { title: string; detail: string; severity: "high" | "medium" | "info"; evidence?: string };
type ScanResult = {
  id: string;
  createdAt: string;
  kind: InputKind;
  risk: "high" | "medium" | "low";
  score: number;
  findings: Finding[];
  preview: string;
};

const rules: Array<{ pattern: RegExp; title: string; detail: string; severity: Finding["severity"] }> = [
  { pattern: /\b(urgent|immediately|right now|within \d+ minutes?|act fast|last chance)\b/i, title: "Pressure or urgency", detail: "Scam messages often pressure people to act before they can verify the request.", severity: "medium" },
  { pattern: /\b(otp|one.time.password|pin|upi pin|password| cvv )\b/i, title: "Requests for secret credentials", detail: "Never share an OTP, UPI PIN, password, or card security code with another person.", severity: "high" },
  { pattern: /\b(refund|cashback|prize|lottery|reward|won|winner|claim)\b/i, title: "Unexpected reward or refund", detail: "Unexpected rewards and refunds can be used to lure people into sharing details or approving a payment.", severity: "medium" },
  { pattern: /\b(scan (the )?qr|receive money|collect payment|approve request|payment request)\b/i, title: "Unusual payment instruction", detail: "A QR scan or payment approval may send money; it is not required just to receive money.", severity: "high" },
  { pattern: /\b(install|download).{0,35}\b(app|application|screen.?sharing|remote access)\b/i, title: "App installation or remote access", detail: "Unrequested apps or screen-sharing access can expose financial information.", severity: "high" },
  { pattern: /\b(keep (this )?secret|don't tell|do not tell|confidential)\b/i, title: "Secrecy request", detail: "A request to hide a payment or conversation can be a manipulation warning sign.", severity: "medium" },
  { pattern: /\b(block(ed)?|suspend(ed)?|deactivat(e|ed|ion))\b/i, title: "Account-threat language", detail: "Threats about account suspension should be verified through the official app or website, not message links.", severity: "medium" },
];

function analyzeInput(raw: string, kind: InputKind): Omit<ScanResult, "id" | "createdAt" | "kind" | "preview"> {
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
  const score = unique.reduce((sum, item) => sum + (item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 0), 0);
  const risk = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { findings: unique, score, risk };
}

const riskCopy = {
  high: { label: "High risk indicators", message: "Pause. Do not pay or share information until you independently verify the request.", className: "text-red-400", icon: ShieldAlert },
  medium: { label: "Caution advised", message: "Some warning signs were found. Verify the sender and destination through an official channel.", className: "text-amber-400", icon: AlertTriangle },
  low: { label: "No obvious warning signs detected", message: "This is not proof that the request is safe. The checks here are limited and cannot verify the sender.", className: "text-emerald-400", icon: CheckCircle2 },
};

export default function PayShield() {
  const [kind, setKind] = useState<InputKind>("message");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [copied, setCopied] = useState(false);

  const placeholder = useMemo(() => {
    if (kind === "url") return "Paste a suspicious website link…";
    if (kind === "upi") return "Enter a UPI ID, for example name@bank…";
    return "Paste the payment message or request you received…";
  }, [kind]);

  function runScan() {
    if (!input.trim()) return;
    const analysis = analyzeInput(input, kind);
    const scan: ScanResult = {
      ...analysis,
      id: `${Date.now()}`,
      createdAt: new Date().toLocaleString(),
      kind,
      preview: input.trim().slice(0, 84),
    };
    setResult(scan);
    setHistory((items) => [scan, ...items].slice(0, 8));
  }

  async function copySummary() {
    if (!result) return;
    const summary = `${riskCopy[result.risk].label}\n${riskCopy[result.risk].message}\n${result.findings.map((f) => `- ${f.title}: ${f.detail}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const RiskIcon = result ? riskCopy[result.risk].icon : ShieldCheck;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ShieldCheck className="h-4 w-4" /> FinTrack security
          </div>
          <h1 className="font-heading text-3xl font-bold">PayShield</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Understand suspicious payment requests before you act. Review warning signs, not just a score.</p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
          <Sparkles className="h-4 w-4" /> Intelligence preview
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="glass-card space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">Payment request analyzer</h2>
              <p className="mt-1 text-xs text-muted-foreground">Choose what you want to check.</p>
            </div>
            <ScanSearch className="h-5 w-5 text-primary" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              ["message", "Message", FileText],
              ["url", "Website URL", Link2],
              ["upi", "UPI ID", LockKeyhole],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => { setKind(value); setResult(null); }}
                className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${kind === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="payshield-input" className="mb-2 block text-sm font-medium">What would you like to analyze?</label>
            <textarea id="payshield-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder={placeholder}
              rows={7} maxLength={5000}
              className="w-full resize-y rounded-xl border border-input bg-background/70 p-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>Up to 5,000 characters</span><span>{input.length}/5000</span>
            </div>
          </div>

          <button type="button" onClick={runScan} disabled={!input.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            <ScanSearch className="h-4 w-4" /> Analyze request <ArrowRight className="h-4 w-4" />
          </button>
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Prototype mode: analysis runs locally in this browser. Your pasted text is not sent to a server or saved to your account.
          </p>
        </section>

        <section className="glass-card min-h-[390px] p-5 sm:p-6">
          {!result ? (
            <div className="flex h-full min-h-[340px] flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-2xl bg-primary/10 p-4"><ShieldCheck className="h-9 w-9 text-primary" /></div>
              <h2 className="font-heading text-lg font-semibold">Your analysis will appear here</h2>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">Submit a message, website link or UPI ID to see the indicators this prototype can identify.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full bg-secondary px-3 py-1.5">Urgency signals</span>
                <span className="rounded-full bg-secondary px-3 py-1.5">Suspicious links</span>
                <span className="rounded-full bg-secondary px-3 py-1.5">Credential requests</span>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assessment</p>
                  <h2 className={`mt-1 font-heading text-xl font-bold ${riskCopy[result.risk].className}`}>{riskCopy[result.risk].label}</h2>
                </div>
                <RiskIcon className={`h-8 w-8 ${riskCopy[result.risk].className}`} />
              </div>
              <p className="rounded-xl bg-secondary/70 p-3 text-sm leading-relaxed">{riskCopy[result.risk].message}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Indicator score</span><span className="font-semibold text-foreground">{result.score} points · heuristic</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full rounded-full ${result.risk === "high" ? "bg-red-500" : result.risk === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(100, result.score * 12.5)}%` }} />
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">What we noticed ({result.findings.length})</h3>
                {result.findings.length ? result.findings.map((finding, index) => (
                  <div key={`${finding.title}-${index}`} className="rounded-xl border border-border bg-background/50 p-3">
                    <div className="flex items-start gap-2">
                      {finding.severity === "high" ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> : finding.severity === "medium" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{finding.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.detail}</p>
                        {finding.evidence && <p className="mt-2 break-all rounded bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground">Evidence: {finding.evidence}</p>}
                      </div>
                    </div>
                  </div>
                )) : <p className="rounded-xl border border-border bg-background/50 p-3 text-sm text-muted-foreground">No configured warning pattern matched. This does not establish that the request or sender is legitimate.</p>}
              </div>
              <button type="button" onClick={copySummary} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
                <Clipboard className="h-4 w-4" /> {copied ? "Summary copied" : "Copy assessment"}
              </button>
            </div>
          )}
        </section>
      </div>

      <section className="glass-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h2 className="font-heading font-semibold">Recent scans</h2>
          <span className="ml-auto text-xs text-muted-foreground">This session only</span>
          {history.length > 0 && <button type="button" onClick={() => { setHistory([]); setResult(null); }} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Trash2 className="h-3.5 w-3.5" /> Clear</button>}
        </div>
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Your completed analyses will appear here. Scan history is not stored yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {history.map((scan) => (
              <button key={scan.id} type="button" onClick={() => setResult(scan)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-secondary/30">
                <span className={`h-2.5 w-2.5 rounded-full ${scan.risk === "high" ? "bg-red-500" : scan.risk === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{scan.preview || "Empty scan"}</span>
                  <span className="block text-[11px] text-muted-foreground">{scan.kind.toUpperCase()} · {scan.createdAt}</span>
                </span>
                <span className={`text-xs font-medium ${riskCopy[scan.risk].className}`}>{riskCopy[scan.risk].label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p><strong className="text-foreground">Important limitation:</strong> This first prototype uses transparent local pattern checks, not an AI model, bank verification, UPI directory, or live fraud-report database. A low-risk result never means a payment is guaranteed safe. Never enter OTPs, PINs, passwords, full card numbers, or other secrets into a scanner.</p>
      </div>
    </div>
  );
}
