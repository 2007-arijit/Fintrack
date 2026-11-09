import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileText, Link2, ScanSearch, ShieldCheck, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePayShieldHistory } from "@/hooks/usePayShieldHistory";
import NetworkMap from "@/components/payshield/NetworkMap";
import ScanResultView from "@/components/payshield/ScanResultView";
import ScanHistory from "@/components/payshield/ScanHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { analyzeInput, type AiState, type Finding, type InputKind, type ScanResult } from "@/lib/payshieldEngine";
import { isRiskLevel, type RiskLevel } from "@/lib/payshieldRisk";

const kinds = [
  { value: "message", label: "Message", icon: FileText, field: "Message text", help: "Paste the SMS, WhatsApp or email text exactly as you received it.", placeholder: "Paste the payment message or request you received…" },
  { value: "url", label: "Website link", icon: Link2, field: "Website link", help: "Paste the full address. Do not open it first.", placeholder: "https://…" },
  { value: "upi", label: "UPI ID", icon: WalletCards, field: "UPI ID", help: "Enter the ID you were asked to pay, or a upi://pay link.", placeholder: "name@bank" },
] as const;

const samples: Record<InputKind, string> = {
  message: "Dear Customer, your loan A/C has an overdue amount of INR 2490, 191 days past due. This default has been reported to Credit Bureaus. For assistance visit examplebank-support.in/help",
  url: "http://example-bank-reward.test/claim",
  upi: "refunds.helpdesk@okexample",
};

const rank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const SEVERITIES = ["high", "medium", "info"];

/** Hint only; the rule engine still reports on whatever is entered. */
function validationHint(kind: InputKind, value: string): string | null {
  const v = value.trim();
  if (!v || kind === "message") return null;
  if (kind === "url") {
    try { new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`); return null; }
    catch { return "This doesn't look like a complete web address. Include the full link, for example https://example.com."; }
  }
  const pa = v.replace(/^upi:\/\/pay\?/i, "").match(/(?:^|[?&])pa=([^&]+)/i)?.[1] ?? v;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(pa) ? null : "UPI IDs look like name@bank. Check the spelling before you scan.";
}

function cleanAiFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Finding => !!f && typeof f.title === "string" && typeof f.detail === "string" && SEVERITIES.includes(f.severity))
    .slice(0, 8);
}

export default function PayShield() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const history = usePayShieldHistory();

  const [kind, setKind] = useState<InputKind>("message");
  const [input, setInput] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState("Rule checks run in your browser. Scans are saved privately to your account.");
  const [clearOpen, setClearOpen] = useState(false);
  const resultRef = useRef<HTMLElement | null>(null);
  const running = useRef(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const current = kinds.find((k) => k.value === kind)!;
  const hint = validationHint(kind, input);

  function showResult(scan: ScanResult) {
    setResult(scan);
    window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function switchKind(next: InputKind) {
    setKind(next);
    setResult(null);
  }

  function onTabKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : kinds.length - 1)) % kinds.length;
    switchKind(kinds[next].value);
    tabRefs.current[next]?.focus();
  }

  async function runScan() {
    if (!input.trim() || running.current) return;
    running.current = true;
    setBusy(true);
    setStatus("Running rule checks…");
    try {
      const text = input.trim();
      const analysis = analyzeInput(text, kind);
      const now = Date.now();
      let scan: ScanResult = {
        ...analysis, id: `local-${now}`, createdAt: new Date(now).toISOString(), ts: now, kind,
        preview: text.slice(0, 84), aiState: "off", saved: false,
      };
      showResult(scan);

      // The deterministic result is saved first. AI is an optional second pass on top of a saved scan.
      setStatus("Saving your scan…");
      let savedId: string | null = null;
      try {
        const { data, error } = await (supabase as any)
          .from("payshield_scans")
          .insert({ input_kind: kind, input_preview: scan.preview, risk_level: scan.risk, risk_score: Math.min(10, scan.score), findings: scan.findings, ai_used: false })
          .select("id, created_at")
          .single();
        if (error || !data) throw error ?? new Error("No row returned");
        savedId = data.id;
        scan = { ...scan, id: data.id, createdAt: data.created_at, ts: Date.parse(data.created_at), saved: true };
        setStatus("Rule checks complete and saved to your account.");
      } catch {
        setStatus("Rule checks complete, but the scan could not be saved to your history. Check your connection or that the PayShield migration is applied.");
      }

      if (aiConsent && !savedId) {
        scan = { ...scan, aiState: "needs_save" as AiState };
      } else if (aiConsent && savedId) {
        setStatus("Saved. Asking the AI service to review the evidence…");
        let state: AiState = "failed";
        try {
          const { data: ai, error: aiError } = await supabase.functions.invoke("payshield-analyze", {
            body: { scan_id: savedId, kind, input: text, local_findings: analysis.findings, local_score: analysis.score, local_risk: analysis.risk },
          });
          const a = ai?.analysis;
          if (!aiError && a && isRiskLevel(a.risk_level)) {
            // Mirror the server rule: AI can raise the rating, never lower it.
            const risk = rank[a.risk_level as RiskLevel] >= rank[scan.risk] ? (a.risk_level as RiskLevel) : scan.risk;
            const aiScore = typeof a.risk_score === "number" ? Math.max(0, Math.min(10, Math.round(a.risk_score))) : 0;
            scan = {
              ...scan, risk, score: Math.max(scan.score, aiScore),
              findings: [...scan.findings, ...cleanAiFindings(a.additional_findings)],
              aiSummary: typeof a.summary === "string" ? a.summary : undefined,
            };
            state = "ok";
          }
        } catch {
          state = "failed";
        }
        scan = { ...scan, aiState: state };
        setStatus(state === "ok"
          ? "AI review complete. Review the evidence and its limits below."
          : "Your rule-based scan is saved. The AI review did not return an assessment (it may not be configured, or it is temporarily unavailable).");
      }

      showResult(scan);
      queryClient.invalidateQueries({ queryKey: ["payshield_history"] });
      queryClient.invalidateQueries({ queryKey: ["payshield_latest"] });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!user) return;
    const { error } = await (supabase as any).from("payshield_scans").delete().eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't clear your history. Nothing was deleted. Please try again.");
      return;
    }
    setResult(null);
    queryClient.invalidateQueries({ queryKey: ["payshield_history"] });
    queryClient.invalidateQueries({ queryKey: ["payshield_latest"] });
    toast.success("Scan history cleared.");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-xl border border-white/10 bg-[#101828] text-white shadow-card">
        <div className="relative z-10 max-w-xl p-6 sm:p-8 md:py-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/80">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> PayShield
          </span>
          <h1 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Stay one step ahead of digital payment scams.
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:text-base">
            Analyze suspicious messages, links, and payment identifiers with rule-based detection and optional AI-assisted insights.
          </p>
        </div>
        <NetworkMap tone="dark" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[48%] opacity-90 md:block" />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] bg-gradient-to-r from-[#101828] to-transparent md:block" />
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section className="surface space-y-5 p-5 sm:p-6" aria-labelledby="ps-check">
          <h2 id="ps-check" className="font-heading text-lg font-semibold">What do you want to check?</h2>

          <div role="tablist" aria-label="Type of input" className="relative grid grid-cols-3 rounded-xl bg-secondary p-1">
            <span aria-hidden className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-card shadow-card transition-transform duration-300 ease-out motion-reduce:transition-none"
              style={{ transform: `translateX(${kinds.findIndex((k) => k.value === kind) * 100}%)` }} />
            {kinds.map(({ value, label, icon: Icon }, i) => (
              <button key={value} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`ps-tab-${value}`}
                aria-selected={kind === value} aria-controls="ps-panel" tabIndex={kind === value ? 0 : -1}
                onClick={() => switchKind(value)} onKeyDown={(e) => onTabKey(e, i)}
                className={`relative z-10 flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors ${kind === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          <div id="ps-panel" role="tabpanel" aria-labelledby={`ps-tab-${kind}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <label htmlFor="payshield-input" className="text-sm font-medium">{current.field}</label>
              <button type="button" onClick={() => setInput(samples[kind])} className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline">
                Try an example
              </button>
            </div>
            {kind === "message" ? (
              <textarea id="payshield-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={current.placeholder}
                rows={8} maxLength={5000} aria-describedby="ps-help"
                className="w-full resize-y rounded-lg border border-input bg-card p-3.5 text-base outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/30 md:text-sm" />
            ) : (
              <Input id="payshield-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={current.placeholder}
                maxLength={2000} autoComplete="off" autoCapitalize="none" spellCheck={false}
                aria-invalid={hint ? true : undefined} aria-describedby={hint ? "ps-help ps-hint" : "ps-help"}
                onKeyDown={(e) => { if (e.key === "Enter") runScan(); }} />
            )}
            <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
              <div>
                <p id="ps-help" className="text-muted-foreground">{current.help}</p>
                {hint && <p id="ps-hint" className="mt-1 text-warning" role="status">{hint}</p>}
              </div>
              {kind === "message" && <span className="shrink-0 tabular-nums text-muted-foreground">{input.length} / 5,000</span>}
            </div>
          </div>

          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-xs leading-relaxed transition-colors ${aiConsent ? "border-primary/40 bg-primary/5" : ""}`}>
            <input type="checkbox" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" />
            <span>
              <span className="block text-sm font-medium">Add an AI review</span>
              <span className="text-muted-foreground">Optional. Sends this text to the configured AI provider for a second opinion. Do not include OTPs, PINs, passwords, full card numbers or other secrets.</span>
            </span>
          </label>

          <Button size="lg" className="w-full" onClick={runScan} disabled={!input.trim()} loading={busy}>
            {!busy && <ScanSearch />} {busy ? "Checking…" : "Check this"}
          </Button>
          <div className={`h-0.5 rounded-full bg-secondary ${busy ? "ps-scan-bar" : "opacity-0"}`} aria-hidden />
          <p className="text-xs leading-relaxed text-muted-foreground" role="status" aria-live="polite">
            {status} {aiConsent ? "The AI review goes through a secure server function." : "Without the AI review, only the rule checks run."}
          </p>
        </section>

        <section ref={resultRef} className="surface min-h-[420px] p-5 sm:p-6" aria-labelledby="ps-result" aria-live="polite">
          <h2 id="ps-result" className="sr-only">Result</h2>
          {!result ? (
            <div className="flex h-full min-h-[360px] flex-col justify-center">
              <span className="mb-4 w-fit rounded-xl bg-primary/10 p-3 text-primary"><ShieldCheck className="h-7 w-7" aria-hidden /></span>
              <p className="font-heading text-lg font-semibold">Nothing checked yet</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">Add something you received and choose Check this. The result shows each warning sign found, why it matters and what to do next.</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {["Pressure, threats and fake deadlines", "Links that hide where they lead", "Requests for OTPs, PINs and passwords"].map((t) => (
                  <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>
          ) : (
            <ScanResultView key={result.id + result.aiState} result={result} />
          )}
        </section>
      </div>

      <ScanHistory
        scans={history.data ?? []}
        loading={history.isLoading}
        error={history.isError}
        refreshing={history.isFetching}
        onRefresh={() => history.refetch()}
        onSelect={showResult}
        onClear={() => setClearOpen(true)}
        selectedId={result?.id}
      />

      <p className="border-l-2 border-warning pl-4 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">What PayShield cannot do.</strong> Rules and AI spot warning signs. They cannot verify a sender, a bank account or a UPI ID, and they cannot promise a payment is safe. AI findings can be wrong. Always confirm through the official bank or payment app, and never type OTPs, PINs, passwords or full card numbers into any scanner.
      </p>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear your scan history?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes all your saved PayShield scans. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep history</AlertDialogCancel>
            <AlertDialogAction onClick={clearHistory}>Clear history</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
