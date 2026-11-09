import { useState } from "react";
import { AlertTriangle, Check, Clipboard, Info, ShieldAlert, Sparkles } from "lucide-react";
import RiskGauge from "@/components/payshield/RiskGauge";
import { StatusBadge } from "@/components/ui/status-badge";
import { RISK_META } from "@/lib/payshieldRisk";
import type { ScanResult } from "@/lib/payshieldEngine";

const copy = {
  high: {
    message: "Potentially suspicious. Pause, and do not pay or share information until you independently verify the request.",
    next: [
      "Do not reply, tap the link or approve any payment request.",
      "Contact your bank using the number on your card or inside its official app.",
      "If you already shared an OTP or PIN, call your bank now and report it on 1930 or cybercrime.gov.in.",
    ],
  },
  medium: {
    message: "Some warning signs were found. Exercise caution and verify the sender and destination through an official channel.",
    next: [
      "Do not use the link or number in the message.",
      "Open your bank or lender's official app and check the account status there.",
      "Ask someone you trust before paying if anything still feels rushed.",
    ],
  },
  low: {
    message: "This is not proof that the request is safe. The checks here are limited and cannot verify the sender.",
    next: [
      "Confirm the sender through an official channel before you pay.",
      "Never share an OTP, PIN or password, whoever is asking.",
    ],
  },
} as const;

const gaugeTone = { high: "text-destructive", medium: "text-warning", low: "text-success" } as const;

const severity = {
  high: { rail: "border-destructive", icon: ShieldAlert, tone: "text-destructive", label: "High" },
  medium: { rail: "border-warning", icon: AlertTriangle, tone: "text-warning", label: "Medium" },
  info: { rail: "border-primary/50", icon: Info, tone: "text-primary", label: "Note" },
} as const;
const order = { high: 0, medium: 1, info: 2 } as const;

function AiPanel({ result }: { result: ScanResult }) {
  if (result.aiState === "ok") {
    return (
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm leading-relaxed" role="status">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-primary"><Sparkles className="h-4 w-4" aria-hidden /> AI-assisted assessment</p>
        {result.aiSummary
          ? <p>{result.aiSummary}</p>
          : <p className="text-muted-foreground">An AI review was recorded for this scan, but no summary was stored.</p>}
        <p className="mt-2 text-xs text-muted-foreground">The AI can raise the rating but never lower it. AI findings can be wrong, so verify through official channels.</p>
      </div>
    );
  }
  if (result.aiState === "failed" || result.aiState === "needs_save") {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm leading-relaxed" role="status">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-warning"><AlertTriangle className="h-4 w-4" aria-hidden /> AI review unavailable</p>
        <p>{result.aiState === "failed"
          ? "The AI review did not return an assessment. The rule-based result above is complete and is the only analysis shown."
          : "The AI review was skipped because this scan could not be saved first. The rule-based result above is complete."}</p>
      </div>
    );
  }
  return (
    <p className="rounded-xl border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
      Rules-only result. Turn on "Add an AI review" before checking if you want an optional second opinion.
    </p>
  );
}

export default function ScanResultView({ result }: { result: ScanResult }) {
  const [copied, setCopied] = useState(false);
  const meta = RISK_META[result.risk];
  const text = copy[result.risk];
  const findings = [...result.findings].sort((x, y) => order[x.severity] - order[y.severity]);
  const indicators = findings.filter((f) => f.severity !== "info").length;

  async function copySummary() {
    const summary = `${meta.label}\n${text.message}\n${findings.map((f) => `- ${f.title}: ${f.detail}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-5">
      {!result.saved && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          This result was not saved to your history. The rule checks ran in your browser, but the save to your account failed.
        </p>
      )}

      <div className="grid items-center gap-5 sm:grid-cols-[200px_1fr]">
        <div className={gaugeTone[result.risk]}><RiskGauge score={result.score} risk={result.risk} /></div>
        <div className="ps-reveal" style={{ "--ps-delay": "200ms" } as React.CSSProperties}>
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          <p className="mt-3 text-sm leading-relaxed">{text.message}</p>
          <p className="mt-3 text-sm font-medium">
            {indicators === 0 ? "No indicators detected" : `${indicators} ${indicators === 1 ? "indicator" : "indicators"} detected`}
          </p>
        </div>
      </div>

      <AiPanel result={result} />

      <div>
        <h3 className="mb-3 font-heading text-sm font-semibold">What we noticed ({findings.length})</h3>
        {findings.length ? (
          <ul className="space-y-2.5">
            {findings.map((f, i) => {
              const sev = severity[f.severity] ?? severity.info;
              const Icon = sev.icon;
              return (
                <li key={`${f.title}-${i}`} className={`ps-reveal rounded-r-lg border-l-2 ${sev.rail} bg-secondary/40 py-2.5 pl-3.5 pr-3`}
                  style={{ "--ps-delay": `${300 + Math.min(i, 6) * 60}ms` } as React.CSSProperties}>
                  <div className="flex items-start gap-2.5">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${sev.tone}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{f.title} <span className="ml-1 text-xs font-normal text-muted-foreground">{sev.label}</span></p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.detail}</p>
                      {f.evidence && <p className="mt-2 break-all rounded bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground">{f.evidence}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No warning pattern matched. This does not show that the request or sender is genuine.</p>
        )}
      </div>

      <div className="rounded-xl bg-secondary/60 p-4">
        <h3 className="mb-2 font-heading text-sm font-semibold">What to do next</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
          {text.next.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>

      <button type="button" onClick={copySummary}
        className="flex items-center gap-2 rounded text-xs font-medium text-muted-foreground hover:text-foreground">
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Clipboard className="h-4 w-4" aria-hidden />}
        {copied ? "Copied" : "Copy this assessment"}
      </button>
    </div>
  );
}
