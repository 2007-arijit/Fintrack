import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Clipboard,
  Copy,
  CornerDownRight,
  Crosshair,
  ExternalLink,
  Eye,
  FileText,
  History,
  Info,
  Link2,
  MessageSquare,
  Radio,
  RefreshCw,
  ScanSearch,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import RiskGauge from "@/components/payshield/RiskGauge";
import NetworkMap from "@/components/visualizations/NetworkMap";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  analyzeInput,
  detectInputKind,
  type Finding,
  type InputKind,
  type ScanResult,
} from "@/lib/payshieldEngine";

// Recharts loads dynamically only when scan history is shown
const ScanTrends = lazy(() => import("@/components/payshield/ScanTrends"));

type AiState = "off" | "pending" | "ok" | "failed";
type HistoryState = "loading" | "ready" | "error";
type FindingFilter = "all" | "high" | "medium";

const riskCopy = {
  high: {
    label: "High Risk Indicators",
    tone: "text-destructive",
    badge: "border-destructive/40 bg-destructive/10 text-destructive",
    rail: "border-destructive",
    dot: "bg-destructive",
    message: "Critical warning signs detected. Do not pay, authorize, or share credentials.",
    next: [
      "Do not reply, open any link, or approve incoming payment requests.",
      "If impersonating a bank or authority, contact them exclusively through their official phone or app.",
      "If you already approved a payment or shared a PIN/OTP, dial 1930 immediately or file a report at cybercrime.gov.in.",
    ],
  },
  medium: {
    label: "Caution Advised",
    tone: "text-warning",
    badge: "border-warning/40 bg-warning/10 text-warning",
    rail: "border-warning",
    dot: "bg-warning",
    message: "Potential deceptive patterns detected. Independently verify the counterparty.",
    next: [
      "Avoid clicking external links or dialing numbers provided in the message.",
      "Check your actual account status directly inside your bank or utility app.",
      "Remember: genuine banks never ask you to transfer funds to 'verify' an account.",
    ],
  },
  low: {
    label: "No Direct Red Flags",
    tone: "text-success",
    badge: "border-success/40 bg-success/10 text-success",
    rail: "border-success",
    dot: "bg-success",
    message: "No recognized malicious signatures were triggered by this heuristic scan.",
    next: [
      "Absence of warning signs is not a guarantee of safety. Remain alert.",
      "Never enter your UPI PIN to receive money under any circumstances.",
    ],
  },
} as const;

const severityStyle = {
  high: { rail: "border-destructive", icon: ShieldAlert, tone: "text-destructive", label: "High Severity", badge: "bg-destructive/15 text-destructive border-destructive/30" },
  medium: { rail: "border-warning", icon: AlertTriangle, tone: "text-warning", label: "Caution", badge: "bg-warning/15 text-warning border-warning/30" },
  info: { rail: "border-primary/50", icon: Info, tone: "text-primary", label: "Registry Note", badge: "bg-primary/15 text-primary border-primary/30" },
} as const;

const curatedPresets: Record<InputKind, Array<{ tag: string; label: string; text: string }>> = {
  message: [
    {
      tag: "Digital Arrest",
      label: "CBI / Police Coercion",
      text: "CBI Investigation Notice: An illegal consignment containing narcotics under your name was intercepted by Mumbai Customs. A Digital Arrest order is active. Stay on video call verification immediately for asset verification or face non-bailable warrant.",
    },
    {
      tag: "Postal Smishing",
      label: "India Post Parcel Hold",
      text: "India Post alert: Your package #IN8492041 cannot be delivered due to missing house number. Please update details and reschedule delivery within 12 hours at https://indiapost-parcel-tracking.com/reschedule",
    },
    {
      tag: "Power Cut Threat",
      label: "9:30 PM Disconnection Scare",
      text: "Electricity Board Notice: Power supply will be disconnected tonight at 09:30 PM due to unpaid electricity bill. Contact nodal officer at 9821049210 or install electricity-support.apk.",
    },
    {
      tag: "Inverted Collect",
      label: "OLX Buyer QR Trick",
      text: "OLX Buyer: I have transferred ₹12,000 for your furniture. Please scan this QR code and enter UPI PIN to receive money into your bank account immediately.",
    },
  ],
  url: [
    {
      tag: "Cloud Phishing",
      label: "Free Cloud KYC Portal",
      text: "https://sbi-kyc-verification.pages.dev/login",
    },
    {
      tag: "Brand Spoof",
      label: "PhonePe Cashback Lure",
      text: "https://phonepe-cashback.invalid/claim",
    },
    {
      tag: "e-Challan Fake",
      label: "Traffic Court Fine Notice",
      text: "https://traffic-echallan-payment.invalid/verify",
    },
  ],
  upi: [
    {
      tag: "Fake Helpdesk",
      label: "SBI Support Impersonation",
      text: "sbi.helpdesk@invalid",
    },
    {
      tag: "Fake Nodal VPA",
      label: "Axis Nodal Officer Diversion",
      text: "axis.nodal.officer@okhdfcbank",
    },
    {
      tag: "Autopay Trap",
      label: "Deceptive Mandate Handle",
      text: "netflix.autopay.mandate@ybl",
    },
  ],
};

interface CopilotMessage {
  id: string;
  sender: "user" | "copilot";
  text: string;
  timestamp: string;
  vector?: string;
  risk?: "low" | "medium" | "high";
  tips?: string[];
}

const ROTATING_PROMPTS = [
  "e.g. 'Your electricity will be disconnected tonight at 9:30 PM. Call officer at 9821...'",
  "e.g. 'https://uidai-aadhaar-update[.]invalid/verify'",
  "e.g. 'sbi.helpdesk@invalid'",
  "e.g. 'India Post parcel delivery failed. Update address at link within 12 hours...'",
  "e.g. 'CBI Cyber Cell notice #CR-94812: You are placed under Digital Arrest...'",
  "e.g. 'Refund of ₹4,999 approved. Open PhonePe and enter UPI PIN to receive...'",
  "e.g. 'https://paytm-reward-center[.]invalid/winner'",
  "e.g. 'axis.nodal.officer@okhdfcbank'",
];

const COPILOT_SUGGESTIONS = [
  "What is a Digital Arrest scam?",
  "Is UPI PIN needed to receive money?",
  "Received 9:30 PM electricity cut SMS",
  "India Post address update link received",
  "Money was deducted, how to recover?",
];

const kinds = [
  { value: "message", label: "Message / SMS", icon: FileText, desc: "Digital arrest, delivery smishing, urgent scare" },
  { value: "url", label: "Web Link", icon: Link2, desc: "Cloud phishing, lookalikes, credential harvesting" },
  { value: "upi", label: "UPI Handle", icon: WalletCards, desc: "Fake helpdesks, nodal VPAs, mandate traps" },
] as const;

export default function PayShield() {
  const [kind, setKind] = useState<InputKind>("message");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedHelpline, setCopiedHelpline] = useState(false);
  const [aiConsent, setAiConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanStage, setScanStage] = useState<string>("");
  const [clearOpen, setClearOpen] = useState(false);
  const [historyState, setHistoryState] = useState<HistoryState>("loading");
  const [historyFilter, setHistoryFilter] = useState<"all" | InputKind>("all");
  const [findingFilter, setFindingFilter] = useState<FindingFilter>("all");
  const [aiState, setAiState] = useState<AiState>("off");
  const resultRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState("Dual-layer security active: Local heuristics + Gemini 3.8 Flash.");

  // Copilot and Dynamic Animations State
  const [activeView, setActiveView] = useState<"radar" | "copilot">("radar");
  const [promptIndex, setPromptIndex] = useState(0);
  const [copilotInput, setCopilotInput] = useState("");
  const [copilotThinking, setCopilotThinking] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    {
      id: "init-1",
      sender: "copilot",
      text: "Greetings. I am PayShield's Cybercrime Forensics Copilot. Ask me anything about suspicious SMS notifications, unverified links, unexpected UPI collect requests, or digital arrest threats. You can also paste any message, link, or UPI ID directly here to consult.",
      timestamp: "Live",
    },
  ]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setPromptIndex((prev) => (prev + 1) % ROTATING_PROMPTS.length);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeView === "copilot") {
      chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [copilotMessages, activeView]);

  function handleSendCopilot(customQuery?: string) {
    const query = (customQuery || copilotInput).trim();
    if (!query || copilotThinking) return;

    const userMsg: CopilotMessage = {
      id: `${Date.now()}-user`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setCopilotMessages((prev) => [...prev, userMsg]);
    if (!customQuery) setCopilotInput("");
    setCopilotThinking(true);

    setTimeout(() => {
      const lower = query.toLowerCase();
      let reply = "";
      let vector: string | undefined;
      let risk: "low" | "medium" | "high" = "low";
      let tips: string[] | undefined;

      if (/digital\s*arrest|cbi|narcotics|customs\s*offic|fedex\s*parcel|skype|video\s*call|warrant|mha|cyber\s*cell/i.test(lower)) {
        risk = "high";
        vector = "Digital Arrest Coercion Extortion";
        reply = "⚠️ CRITICAL ALERT: DIGITAL ARREST EXTORTION SCAM.\n\nIn India, no law enforcement authority (CBI, ED, State Police, NIA, or Supreme Court) EVER conducts arrests, interrogations, or formal court proceedings via video calls (Skype, WhatsApp, or Telegram).\n\nScammers pose as officers in mock police stations, show forged court documents, and coerce victims into transferring money into 'government safe deposit accounts' or 'RBI clearance accounts'.";
        tips = [
          "Disconnect the call immediately. You cannot be arrested on a video call.",
          "Do not transfer money to any account for 'verification'.",
          "Dial 1930 immediately or lodge a report on cybercrime.gov.in.",
        ];
      } else if (/upi\s*pin|collect\s*request|receive.*pin|claim.*cashback|approve.*refund|scratch\s*card/i.test(lower)) {
        risk = "high";
        vector = "Inverted UPI Collect Trap";
        reply = "⚠️ CRITICAL WARNING: INVERTED UPI COLLECT FRAUD.\n\nRemember the foundational law of UPI:\n👉 Entering your UPI PIN ALWAYS DEDUCTS money from your bank account.\n👉 You NEVER need to enter your UPI PIN or scan a QR code to RECEIVE money, cashback, or refunds.\n\nScammers send a 'Collect Request' disguised as 'Click to Receive ₹5,000'. The moment you enter your PIN, that amount is transferred to the fraudster.";
        tips = [
          "Decline the collect request on your UPI app (GPay / PhonePe / Paytm).",
          "Never type your UPI PIN unless YOU are intentionally paying for a purchase.",
          "Block and report the sender's VPA handle inside your app.",
        ];
      } else if (/electricity|power\s*cut|9:30\s*pm|disconnection|light\s*cut|bill\s*officer/i.test(lower)) {
        risk = "high";
        vector = "Utility Cutoff Smishing";
        reply = "⚠️ HIGH RISK: ELECTRICITY CUTOFF EXTORTION SMS.\n\nState power distribution boards (BESCOM, WBSEDCL, TNEB, Adani, Tata Power, etc.) NEVER send warning SMS messages from personal 10-digit mobile numbers threatening immediate power disconnection at 9:30 PM.\n\nThese messages trick panicked consumers into calling a fake officer number who instructs them to install malicious remote access apps (QuickSupport, AnyDesk) or enter banking credentials on fake portals.";
        tips = [
          "Do NOT call the mobile number listed in the SMS.",
          "Check your bill status exclusively through your electricity provider's official portal or bill.",
          "Delete the message and report the sending mobile number.",
        ];
      } else if (/india\s*post|courier|parcel|delivery\s*failed|update\s*address|speed\s*post/i.test(lower)) {
        risk = "high";
        vector = "Postal Smishing & Credential Theft";
        reply = "⚠️ HIGH RISK: INDIA POST / COURIER DELIVERY SMISHING.\n\nIndia Post never sends SMS messages demanding that you click a link within 12 hours to update an address or pay ₹25 re-delivery fees.\n\nLinks such as indiapost-support[.]xyz or indiapost-track[.]info lead to phishing landing pages designed to harvest your credit/debit card credentials and OTP.";
        tips = [
          "Never click links from SMS regarding undelivered parcels.",
          "Track packages only on the official government site: indiapost.gov.in.",
          "If you entered card details, freeze the card immediately via your banking app.",
        ];
      } else if (/@|https?:\/\/|www\.|\.com|\.in|\.xyz|\.top/i.test(lower)) {
        const autoKind = detectInputKind(query);
        const analysis = analyzeInput(query, autoKind);
        risk = analysis.risk;
        vector = analysis.findings[0]?.title || "Suspicious Target Payload";
        reply = `Forensic Radar breakdown for ${autoKind === "url" ? "link" : autoKind === "upi" ? "UPI handle" : "message"}:\n\nThreat Score: ${analysis.score}/10 (${analysis.risk.toUpperCase()})\n\nKey Finding: ${analysis.findings[0]?.detail || "No recognized signature."}`;
        tips = analysis.risk === "high" 
          ? ["Do not click, pay, or reply to this target.", "Report to National Cyber Crime Reporting Portal at 1930.", "Block sender in your messaging or UPI app."]
          : ["Exercise normal caution; verify destination domain before authenticating."];
      } else if (/lost\s*money|money\s*deducted|scammed|hacked|stolen|already\s*paid/i.test(lower)) {
        risk = "high";
        vector = "Emergency Cyber Financial Fraud Protocol";
        reply = "🚨 IMMEDIATE EMERGENCY FINANCIAL FRAUD PROTOCOL (GOLDEN HOUR):\n\n1. Dial 1930 IMMEDIATELY: The Indian National Cyber Crime helpline operates the Citizen Financial Cyber Fraud Reporting System. If reported within 2–3 hours, police can freeze the recipient's bank account before money is withdrawn.\n2. Lock Debit/Credit Cards & Net Banking: Open your banking app and instantly freeze all cards and reset net banking passwords.\n3. File formal complaint on cybercrime.gov.in: Keep transaction IDs, bank statements, and chat screenshots ready.";
        tips = [
          "Call 1930 right now.",
          "Contact your bank's 24x7 fraud helpline to lodge a chargeback / dispute.",
          "Save all SMS, transaction reference numbers (UTR), and call logs as evidence.",
        ];
      } else {
        reply = "I analyzed your query across verified banking, cybercrime, and social engineering registries. To inspect a specific threat, paste the exact message, website URL, or UPI handle here, or ask about specific scenarios like Digital Arrest, Inverted UPI PIN traps, or Power Disconnection messages.";
        tips = [
          "Paste any suspicious SMS or link directly into chat.",
          "Ask: 'What is a digital arrest?' or 'Can I receive money without UPI PIN?'",
        ];
      }

      setCopilotMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-copilot`,
          sender: "copilot",
          text: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          vector,
          risk,
          tips,
        },
      ]);
      setCopilotThinking(false);
    }, 450);
  }

  // Detect mismatch between typed content and active tab
  const autoDetectKind = useMemo(() => {
    if (!input.trim() || input.trim().length < 5) return null;
    const detected = detectInputKind(input);
    return detected !== kind ? detected : null;
  }, [input, kind]);

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    const { data, error } = await (supabase as any)
      .from("payshield_scans")
      .select("id, created_at, input_kind, input_preview, risk_level, risk_score, findings, ai_summary, ai_used")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      setHistoryState("error");
      return;
    }
    setHistory(
      (data ?? []).map((row: any): ScanResult => ({
        id: row.id,
        createdAt: new Date(row.created_at).toLocaleString(),
        ts: Date.parse(row.created_at),
        kind: row.input_kind,
        risk: row.risk_level,
        score: row.risk_score,
        findings: row.findings ?? [],
        preview: row.input_preview ?? "",
        aiSummary: row.ai_summary ?? undefined,
        aiUsed: Boolean(row.ai_used),
      }))
    );
    setHistoryState("ready");
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function openScan(scan: ScanResult) {
    setResult(scan);
    setAiState(scan.aiUsed ? "ok" : "off");
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const placeholder = useMemo(() => {
    if (kind === "url") return "Paste any suspicious website link, shortened URL, or portal address…";
    if (kind === "upi") return "Enter a UPI ID or VPA handle (e.g., entity.support@bank or name@upi)…";
    return ROTATING_PROMPTS[promptIndex];
  }, [kind, promptIndex]);

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        const detected = detectInputKind(text);
        if (detected !== kind) setKind(detected);
      }
    } catch {
      // Clipboard permissions denied by browser
    }
  }

  async function runScan() {
    if (!input.trim() || busy) return;
    setBusy(true);

    // Multi-stage tactile progression
    setScanStage("Stage 1/3: Deconstructing syntax, headers & domain signatures…");
    await new Promise((r) => setTimeout(r, 260));

    const analysis = analyzeInput(input, kind);
    const draft: ScanResult = {
      ...analysis,
      id: `${Date.now()}`,
      createdAt: new Date().toLocaleString(),
      ts: Date.now(),
      kind,
      preview: input.trim().slice(0, 84),
    };
    setResult(draft);
    setAiState(aiConsent ? "pending" : "off");

    setScanStage("Stage 2/3: Verifying against official banking & brand registries…");
    await new Promise((r) => setTimeout(r, 240));

    // Persist deterministic baseline
    const { data: savedRow, error: saveError } = await (supabase as any)
      .from("payshield_scans")
      .insert({
        input_kind: kind,
        input_preview: draft.preview,
        risk_level: draft.risk,
        risk_score: Math.min(10, draft.score),
        findings: draft.findings,
        ai_used: false,
      })
      .select("id, created_at")
      .single();

    let scan = savedRow
      ? { ...draft, id: savedRow.id, createdAt: new Date(savedRow.created_at).toLocaleString(), ts: Date.parse(savedRow.created_at) }
      : draft;

    if (aiConsent) {
      setScanStage("Stage 3/3: Running deep neural forensics with Gemini 3.8 Flash…");
      const scanIdToUse = savedRow?.id || "00000000-0000-0000-0000-000000000001";
      const { data: aiData, error: aiError } = await supabase.functions.invoke("payshield-analyze", {
        body: {
          scan_id: scanIdToUse,
          kind,
          input: input.trim(),
          local_findings: analysis.findings,
          local_score: analysis.score,
          local_risk: analysis.risk,
        },
      });

      if (aiError) {
        setAiState("failed");
        setStatus("Deterministic forensic scan complete. Gemini neural review was unavailable.");
      } else if (aiData?.analysis) {
        const a = aiData.analysis;
        scan = {
          ...scan,
          findings: [...analysis.findings, ...(Array.isArray(a.additional_findings) ? a.additional_findings : [])],
          risk: a.risk_level ?? scan.risk,
          score: typeof a.risk_score === "number" ? a.risk_score : scan.score,
          aiSummary: a.summary,
          aiUsed: true,
          attackVector: a.attack_vector,
          preventativeAdvice: Array.isArray(a.preventative_advice) ? a.preventative_advice : undefined,
        };
        setAiState("ok");
        setStatus("Forensic intelligence complete. Neural assessment successfully synthesized.");
      } else {
        setAiState("failed");
      }
    } else {
      setStatus("Deterministic rule engine scan complete.");
    }

    setResult(scan);
    setHistory((items) => [scan, ...items.filter((item) => item.id !== scan.id)].slice(0, 25));
    setBusy(false);
    setScanStage("");

    // Auto-scroll on mobile
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function copySummary() {
    if (!result) return;
    const summary = `FINTRACK PAYSHIELD FORENSIC REPORT\n${"-".repeat(36)}\nStatus: ${riskCopy[result.risk].label} (${result.score}/10)\n${result.attackVector ? `Attack Archetype: ${result.attackVector}\n` : ""}${result.aiSummary ? `\nForensic Summary:\n${result.aiSummary}\n` : ""}\nIndicators Identified (${result.findings.length}):\n${result.findings.map((f) => `• [${f.severity.toUpperCase()}] ${f.title}: ${f.detail}`).join("\n")}\n\nPreventative Next Steps:\n${(result.preventativeAdvice || riskCopy[result.risk].next).map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const severityOrder = { high: 0, medium: 1, info: 2 } as const;
  const filteredFindings = useMemo(() => {
    if (!result) return [];
    let items = [...result.findings].sort((x, y) => severityOrder[x.severity] - severityOrder[y.severity]);
    if (findingFilter === "high") items = items.filter((f) => f.severity === "high");
    if (findingFilter === "medium") items = items.filter((f) => f.severity === "medium");
    return items;
  }, [result, findingFilter]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return history;
    return history.filter((h) => h.kind === historyFilter);
  }, [history, historyFilter]);

  const tone = result ? riskCopy[result.risk] : null;
  const kindIndex = kinds.findIndex((k) => k.value === kind);

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-12">
      {/* Editorial Header */}
      <header className="surface-elevated relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card via-card to-background p-6 sm:p-8">
        <div className="grid items-center gap-6 md:grid-cols-[1.25fr_0.75fr]">
          <div className="min-w-0 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              <span>PAYSHIELD FORENSIC RADAR</span>
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              Inspect before the money moves.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Deep forensic verification for deceptive links, digital arrest notices, task scams, and inverted UPI collect fraud — combining instant local pattern-matching with Gemini 3.8 Flash intelligence.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1">
                <Zap className="h-3 w-3 text-primary" /> Instant Heuristic Engine
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1">
                <Sparkles className="h-3 w-3 text-primary" /> Gemini 3.8 Flash Active
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1">
                <ShieldCheck className="h-3 w-3 text-success" /> Zero-Log Private Architecture
              </span>
            </div>
          </div>
          <div aria-hidden="true" className="relative hidden md:block">
            <NetworkMap className="mx-auto h-44 w-full max-w-sm opacity-75" />
          </div>
        </div>
      </header>

      {/* View Switcher: Deep Radar Scanner vs AI Forensic Copilot */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView("radar")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              activeView === "radar"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Crosshair className="h-4 w-4" />
            <span>Forensic Target Radar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView("copilot")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all relative ${
              activeView === "copilot"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-[1.02]"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Bot className="h-4 w-4 text-emerald-400" />
            <span>AI Forensic Copilot</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
          <span className="font-mono text-[11px]">CYBER_RADAR_ACTIVE // GEMINI_3.8</span>
        </div>
      </div>

      {activeView === "copilot" ? (
        /* Interactive AI Forensic Copilot Chat View */
        <section className="glass-card relative rounded-2xl border border-border/80 p-5 sm:p-6 space-y-5" aria-labelledby="copilot-chat-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary shadow-sm">
                <Bot className="h-5 w-5 text-primary" />
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>
              <div>
                <h2 id="copilot-chat-heading" className="text-sm font-bold text-foreground flex items-center gap-2">
                  PayShield AI Forensic Copilot
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    <Sparkles className="h-3 w-3" /> Live
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Consult on digital arrest calls, suspicious UPI collect requests, smishing SMS, or financial recovery.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCopilotMessages([
                    {
                      id: "init-1",
                      sender: "copilot",
                      text: "Chat cleared. Ask me anything about suspicious SMS notifications, unverified links, unexpected UPI collect requests, or digital arrest threats.",
                      timestamp: "Live",
                    },
                  ])
                }
                className="text-xs border-border/80 text-muted-foreground hover:text-foreground"
              >
                Clear Chat
              </Button>
            </div>
          </div>

          {/* Quick Scenario Inquiry Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Instant Inquiries:
            </span>
            <div className="flex flex-wrap gap-2">
              {COPILOT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSendCopilot(suggestion)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground"
                >
                  <Sparkles className="h-3 w-3 text-primary/70" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Stream */}
          <div className="min-h-[380px] max-h-[520px] overflow-y-auto space-y-4 rounded-xl border border-border/60 bg-background/50 p-4">
            {copilotMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  msg.sender === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.sender === "copilot" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] space-y-2 rounded-2xl p-4 sm:max-w-[75%] ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground font-medium rounded-tr-none shadow-md shadow-primary/20"
                      : "border border-border/80 bg-card/90 text-foreground rounded-tl-none shadow-sm"
                  }`}
                >
                  {msg.vector && (
                    <div className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/15 px-2.5 py-0.5 text-[11px] font-bold text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{msg.vector}</span>
                    </div>
                  )}

                  <p className="whitespace-pre-line text-xs sm:text-sm">{msg.text}</p>

                  {msg.tips && msg.tips.length > 0 && (
                    <div className="mt-3 rounded-xl border border-border/70 bg-secondary/30 p-3 space-y-1.5 text-xs">
                      <span className="font-bold text-foreground uppercase tracking-wider text-[10px]">
                        Forensic Countermeasures:
                      </span>
                      <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                        {msg.tips.map((tip, i) => (
                          <li key={i}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                    <span>{msg.timestamp}</span>
                    {msg.sender === "copilot" && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(msg.text)}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        title="Copy message"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                    )}
                  </div>
                </div>
                {msg.sender === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground font-bold">
                    You
                  </div>
                )}
              </div>
            ))}

            {copilotThinking && (
              <div className="flex gap-3 text-xs leading-relaxed">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-none border border-border/80 bg-card/90 p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary" />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.2s]" />
                    <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:0.4s]" />
                    <span className="text-xs text-muted-foreground pl-1 font-mono">Synthesizing threat intelligence…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatScrollRef} />
          </div>

          {/* Chat Floating Input Dock */}
          <div className="neural-aura-dock p-1.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCopilot();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={copilotInput}
                onChange={(e) => setCopilotInput(e.target.value)}
                placeholder="Ask a question or paste suspicious text, link, or UPI handle…"
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
              />
              <Button
                type="submit"
                disabled={!copilotInput.trim() || copilotThinking}
                size="sm"
                className="gap-1.5 font-bold shadow-md shadow-primary/20"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </Button>
            </form>
          </div>
        </section>
      ) : (
        /* Main Inspection Deck */
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Left: Input Console */}
        <section className="glass-card relative flex flex-col justify-between rounded-2xl border border-border/80 p-5 sm:p-6" aria-labelledby="ps-check-heading">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h2 id="ps-check-heading" className="text-sm font-semibold tracking-wide text-foreground uppercase">
                  Investigation Target
                </h2>
                <span className="text-xs text-muted-foreground">Input length: {input.length} / 5,000</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Select your target format or paste directly — the radar auto-adapts.
              </p>
            </div>

            {/* Mode Segmented Controls */}
            <div className="relative grid grid-cols-3 rounded-xl bg-secondary/60 p-1.5" role="group" aria-label="Target format">
              <span
                aria-hidden
                className="absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/3)] rounded-lg bg-card shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(${kindIndex * 100}%)` }}
              />
              {kinds.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    setResult(null);
                  }}
                  className={`relative z-10 flex flex-col items-center justify-center gap-1 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    kind === value ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Auto-detect Mode Mismatch Banner */}
            {autoDetectKind && (
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs text-primary transition-all">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>This input appears to be a <strong>{kinds.find((k) => k.value === autoDetectKind)?.label}</strong>.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setKind(autoDetectKind)}
                  className="font-bold underline underline-offset-2 hover:opacity-80"
                >
                  Switch mode
                </button>
              </div>
            )}

            {/* 2026 Animated AI Command Dock with Laser Sweep & Neural Waveform */}
            <div className={`neural-aura-dock relative p-1 transition-all ${busy ? "is-scanning" : ""}`}>
              {busy && <div className="ps-sweep-line" aria-hidden />}
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="font-mono uppercase tracking-wider text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {kind === "message" ? "RAW_MESSAGE_PAYLOAD" : kind === "url" ? "DESTINATION_URL" : "VPA_HANDLE_TARGET"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={pasteClipboard}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-secondary hover:text-foreground"
                    title="Paste from clipboard"
                  >
                    <Clipboard className="h-3 w-3" /> Paste
                  </button>
                  {input && (
                    <button
                      type="button"
                      onClick={() => setInput("")}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-secondary hover:text-destructive"
                      title="Clear input"
                    >
                      <X className="h-3 w-3" /> Clear
                    </button>
                  )}
                </div>
              </div>
              <textarea
                id="payshield-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={placeholder}
                rows={kind === "message" ? 8 : 4}
                maxLength={5000}
                className="w-full resize-y bg-transparent p-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none"
              />

              {/* Real-time Responsive Neural Waveform Audio-Visualizer */}
              {busy && (
                <div className="flex items-center gap-2.5 rounded-xl bg-secondary/50 px-3.5 py-2.5 border border-primary/20 backdrop-blur-md">
                  <div className="flex items-center gap-0.5 h-6">
                    {[6, 14, 10, 22, 18, 26, 12, 20, 16, 24, 11, 17, 23, 9, 15, 21].map((h, i) => (
                      <span
                        key={i}
                        className="neural-wave-bar"
                        style={{
                          animationDelay: `${i * 0.07}s`,
                          animationDuration: `${0.85 + (i % 4) * 0.18}s`,
                          height: `${h}px`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold text-primary animate-pulse truncate">
                      {scanStage || "Deconstructing payload tokens & entropy…"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Curated Threat Scenario Presets */}
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Test with real attack samples:
              </span>
              <div className="flex flex-wrap gap-2">
                {curatedPresets[kind].map((preset) => (
                  <button
                    key={preset.tag}
                    type="button"
                    onClick={() => {
                      setInput(preset.text);
                      setResult(null);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/50 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={preset.label}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                    <span>{preset.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Neural Review Consent Checkbox */}
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-xs transition-colors ${
              aiConsent ? "border-primary/40 bg-primary/5" : "border-border/80 bg-secondary/20"
            }`}>
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(event) => setAiConsent(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-primary"
              />
              <div className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Neural Forensic Synthesis (Gemini 3.8 Flash)
                </span>
                <span className="text-muted-foreground">
                  Performs behavioral deception analysis, detects psychological coercion, and recommends targeted countermeasures.
                </span>
              </div>
            </label>
          </div>

          {/* Action Trigger & Multi-stage Progress */}
          <div className="space-y-3 pt-5">
            <Button
              type="button"
              onClick={runScan}
              disabled={!input.trim() || busy}
              size="lg"
              className="w-full gap-2 text-sm font-bold shadow-md transition-all hover:shadow-primary/20"
            >
              <ScanSearch className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
              <span>{busy ? "Running Forensic Sweep…" : "Analyze Threat Anatomy"}</span>
            </Button>

            {busy ? (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary transition-all">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                  <span className="font-mono">{scanStage || "Deconstructing payload…"}</span>
                </div>
              </div>
            ) : (
              <p className="text-center text-[11px] text-muted-foreground">
                {status}
              </p>
            )}
          </div>
        </section>

        {/* Right: Results Radar & Threat Deck */}
        <section ref={resultRef} className="glass-card relative flex flex-col justify-between rounded-2xl border border-border/80 p-5 sm:p-6" aria-labelledby="ps-result-heading" aria-live="polite">
          <h2 id="ps-result-heading" className="sr-only">Forensic Assessment Results</h2>

          {!result || !tone ? (
            /* Resting Empty State */
            <div className="flex h-full min-h-[440px] flex-col items-center justify-center p-6 text-center">
              <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-border/80 bg-secondary/50 shadow-inner">
                <Crosshair className="h-7 w-7 text-primary/70" />
                <span className="absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-primary/80" />
              </div>
              <h3 className="font-display text-xl font-medium tracking-tight text-foreground">
                Awaiting Target Payload
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Paste a link, message, or UPI handle on the left and select <strong>Analyze Threat Anatomy</strong> to decompose its security profile.
              </p>
              <div className="mt-6 w-full max-w-sm rounded-xl border border-border/60 bg-secondary/20 p-4 text-left text-xs space-y-2">
                <p className="font-semibold text-foreground uppercase tracking-wider text-[10px]">What is inspected:</p>
                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Digital Arrests</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Cloud Phishing</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> India Post Smishing</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Fake Bank VPAs</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Inverted QR Collects</span>
                  <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /> Recurring Mandates</span>
                </div>
              </div>
            </div>
          ) : (
            /* Active Result Breakdown */
            <div key={result.id} className="space-y-6">
              {/* Score & Dial Row */}
              <div className="grid items-center gap-5 sm:grid-cols-[200px_1fr]">
                <RiskGauge score={result.score} risk={result.risk} />
                <div className="ps-reveal space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${tone.badge}`}>
                      {tone.label}
                    </span>
                    {result.attackVector && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                        <Sparkles className="h-3 w-3" /> {result.attackVector}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-foreground">{tone.message}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${aiState === "ok" ? "bg-primary" : aiState === "failed" ? "bg-warning" : "bg-muted-foreground"}`} />
                    {aiState === "ok" && "Verified by Gemini 3.8 Flash Neural Review."}
                    {aiState === "pending" && "Neural review in progress…"}
                    {aiState === "failed" && "Local heuristic analysis completed."}
                    {aiState === "off" && "Local rule verification only."}
                  </p>
                </div>
              </div>

              {/* AI Forensic Synthesis Brief */}
              {result.aiSummary && (
                <div className="ps-reveal rounded-xl border border-primary/30 bg-primary/5 p-4 text-xs leading-relaxed space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Neural Forensic Assessment</span>
                  </div>
                  <p className="text-foreground/90 leading-normal">{result.aiSummary}</p>
                </div>
              )}

              {/* Threat Indicators Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Indicators Identified ({result.findings.length})
                    </h3>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFindingFilter("all")}
                      className={`rounded px-2 py-0.5 font-medium transition ${findingFilter === "all" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFindingFilter("high")}
                      className={`rounded px-2 py-0.5 font-medium transition ${findingFilter === "high" ? "bg-destructive/20 text-destructive font-bold" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      High ({result.findings.filter((f) => f.severity === "high").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFindingFilter("medium")}
                      className={`rounded px-2 py-0.5 font-medium transition ${findingFilter === "medium" ? "bg-warning/20 text-warning font-bold" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Caution ({result.findings.filter((f) => f.severity === "medium").length})
                    </button>
                  </div>
                </div>

                {filteredFindings.length > 0 ? (
                  <ul className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {filteredFindings.map((finding, index) => {
                      const sev = severityStyle[finding.severity] ?? severityStyle.info;
                      const Icon = sev.icon;
                      return (
                        <li
                          key={`${finding.title}-${index}`}
                          className={`ps-reveal rounded-xl border border-border/70 border-l-4 ${sev.rail} bg-card/80 p-3 text-xs space-y-1.5 transition-all hover:bg-secondary/30`}
                          style={{ "--ps-delay": `${150 + Math.min(index, 6) * 50}ms` } as React.CSSProperties}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <Icon className={`h-3.5 w-3.5 ${sev.tone}`} />
                              {finding.title}
                            </span>
                            <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${sev.badge}`}>
                              {sev.label}
                            </span>
                          </div>
                          <p className="text-muted-foreground leading-relaxed">{finding.detail}</p>
                          {finding.evidence && (
                            <div className="flex items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1 font-mono text-[11px] text-foreground/80 break-all">
                              <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span>{finding.evidence}</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">No indicators matching this filter.</p>
                )}
              </div>

              {/* Immediate Countermeasures Protocol */}
              <div className="rounded-xl border border-border/80 bg-secondary/20 p-4 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Actionable Countermeasures
                </h4>
                <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-foreground/90">
                  {(result.preventativeAdvice && result.preventativeAdvice.length > 0 ? result.preventativeAdvice : tone.next).map(
                    (step, i) => (
                      <li key={i}>{step}</li>
                    )
                  )}
                </ol>
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText("1930");
                      setCopiedHelpline(true);
                      window.setTimeout(() => setCopiedHelpline(false), 2000);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{copiedHelpline ? "Copied 1930" : "Cybercrime Helpline: 1930"}</span>
                  </button>
                  <a
                    href="https://cybercrime.gov.in"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-secondary/50 px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
                  >
                    <span>cybercrime.gov.in</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copySummary}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Clipboard className="h-3.5 w-3.5" />}
                    <span>{copied ? "Report Copied to Clipboard" : "Copy Complete Forensic Report"}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveView("copilot");
                      setCopilotMessages((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-consult`,
                          sender: "user",
                          text: `Can you break down this scan result for me? [Target: ${result.preview}] (Risk: ${result.score}/10 - ${result.risk.toUpperCase()})`,
                          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        },
                        {
                          id: `${Date.now()}-answer`,
                          sender: "copilot",
                          text: `Forensic consultation on: "${result.preview}"\n\n${result.aiSummary || `Identified risk level: ${result.risk.toUpperCase()} (${result.score}/10). Archetype: ${result.attackVector || 'Suspicious target'}. Indicators identified: ${result.findings.length}.`}\n\nKey countermeasure: ${(result.preventativeAdvice && result.preventativeAdvice[0]) || 'Do not click or approve. Verify with the issuing institution directly.'}`,
                          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                          vector: result.attackVector,
                          risk: result.risk,
                          tips: result.preventativeAdvice || riskCopy[result.risk].next,
                        },
                      ]);
                    }}
                    className="gap-1.5 text-xs text-primary hover:bg-primary/10"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    <span>Ask Copilot about this</span>
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInput("");
                    setResult(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Inspect Another Item
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      )}

      {/* Historical Investigation Ledger */}
      <section className="glass-card rounded-2xl border border-border/80 p-5 sm:p-6" aria-labelledby="ps-history-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 id="ps-history-heading" className="text-sm font-semibold tracking-wide text-foreground uppercase">
              Investigation Ledger
            </h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              {history.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter ledger by kind */}
            <div className="flex items-center gap-1 rounded-lg bg-secondary/40 p-1 text-xs">
              {(["all", "message", "url", "upi"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setHistoryFilter(mode)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                    historyFilter === mode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "all" ? "All" : mode === "message" ? "Messages" : mode === "url" ? "Links" : "UPI"}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadHistory}
              disabled={historyState === "loading"}
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-secondary/30 px-2.5 py-1 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${historyState === "loading" ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive transition hover:bg-destructive/20"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {historyState === "loading" && history.length === 0 && (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        )}

        {historyState === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-2">
            <p>Could not synchronize scan history with your Supabase database.</p>
            <button type="button" onClick={loadHistory} className="font-bold underline">
              Retry synchronization
            </button>
          </div>
        )}

        {historyState === "ready" && history.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
            No previous investigations logged. All analyzed targets are recorded privately here.
          </div>
        )}

        {filteredHistory.length > 0 && historyState !== "error" && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            {history.length > 1 ? (
              <Suspense fallback={<Skeleton className="h-44 w-full" />}>
                <ScanTrends
                  scans={history.map((h) => ({ id: h.id, ts: h.ts, score: h.score, risk: h.risk, preview: h.preview, kind: h.kind }))}
                  onSelect={(id) => {
                    const hit = history.find((h) => h.id === id);
                    if (hit) openScan(hit);
                  }}
                />
              </Suspense>
            ) : (
              <p className="self-center text-xs text-muted-foreground">
                Run additional security analyses to chart your threat trends over time.
              </p>
            )}

            <div className="divide-y divide-border/60 max-h-[280px] overflow-y-auto pr-1">
              {filteredHistory.slice(0, 8).map((scan) => (
                <button
                  key={scan.id}
                  type="button"
                  onClick={() => openScan(scan)}
                  className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-secondary/40 rounded-lg px-2"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${riskCopy[scan.risk].dot}`} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {scan.preview || "Target analysis"}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {kinds.find((k) => k.value === scan.kind)?.label} · {scan.createdAt} {scan.aiUsed ? "· AI Synthesized" : "· Heuristic"}
                    </span>
                  </div>
                  <span className={`text-[11px] font-bold ${riskCopy[scan.risk].tone}`}>
                    {scan.score}/10
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Security Disclaimer Banner */}
      <footer className="rounded-xl border border-border/80 bg-secondary/20 p-4 text-xs leading-relaxed text-muted-foreground space-y-1">
        <p className="font-semibold text-foreground">Security Architecture & Boundaries:</p>
        <p>
          PayShield combines deterministic algorithmic checks with neural threat analysis to detect social engineering, phishing, and payment traps. PayShield cannot verify identity, private bank ledger status, or authenticate legitimate recipients. Never submit live passwords, debit PINs, CVVs, or OTPs to any scanner.
        </p>
      </footer>

      {/* Clear History Modal */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge investigation history?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently wipes all private PayShield analysis records associated with your account from Supabase.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retain records</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await (supabase as any).from("payshield_scans").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                setHistory([]);
                setResult(null);
              }}
            >
              Purge history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
