// FinTrack PayShield AI review.
// The user's text is sent to Gemini only after the user explicitly opts in
// in the PayShield UI. Never put GEMINI_API_KEY in the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(10, n));
}

function normalizeRisk(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" ? value : "low";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Sign in is required." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!supabaseUrl || !anonKey) return json({ error: "Server configuration is incomplete." }, 500);
    if (!geminiKey) return json({ error: "AI is not configured yet. Rule-based analysis and saved history remain available." }, 503);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

    const { data: blocked, error: blockedError } = await userClient.rpc("is_user_blocked");
    if (blockedError) return json({ error: "Could not verify account permissions." }, 503);
    if (blocked === true) return json({ error: "This account is temporarily blocked from using PayShield." }, 403);

    const body = await req.json();

    // Mode: Conversational AI Copilot Chat
    if (body.mode === "chat") {
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > 4000) return json({ error: "Query must contain 1–4000 characters." }, 400);

      const conversationHistory = Array.isArray(body.history) ? body.history.slice(-8) : [];
      const systemInstruction = `You are FinTrack PayShield AI Copilot — an elite cybercrime forensics investigator, cybersecurity advisor, and personal finance expert.
You can converse naturally and fluidly in any language (English, Hinglish, casual phrasing) on any topic:
1. For general conversation or queries about personal finance, budgeting, banking rules, how UPI works, cybersecurity best practices, or FinTrack features: Provide clear, warm, engaging, and genuinely useful advice.
2. For suspicious messages, links, UPI handles, calls, or scams (Digital Arrest, 9:30 PM power cutoff, Inverted UPI PIN collect, India Post delivery smishing, Telegram task scams, loan apps):
   - Assess immediately if it is a SCAM and assign Risk Level (LOW, MEDIUM, or HIGH).
   - Identify the specific psychological or technical exploitation technique.
   - Give direct, bulleted emergency countermeasures (e.g. 'Never enter UPI PIN to receive money', 'Disconnect Skype call immediately', 'Call 1930', 'Freeze card in banking app').
Keep formatting clean with clear bullet points and bold headers.`;

      const contents = [
        ...conversationHistory.map((m: any) => ({
          role: m.sender === "user" ? "user" : "model",
          parts: [{ text: String(m.text || "") }],
        })),
        {
          role: "user",
          parts: [{ text: query }],
        },
      ];

      const aiResponse = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(geminiKey),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
            generationConfig: {
              temperature: 0.35,
              maxOutputTokens: 1200,
            },
          }),
        },
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("Gemini chat error:", aiResponse.status, errorText.slice(0, 300));
        return json({ error: "AI service temporarily unavailable." }, 502);
      }

      const aiJson = await aiResponse.json();
      const replyText = aiJson?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      return json({ reply: replyText });
    }

    // Mode: Forensic Radar Scan Analysis
    const scanId = typeof body.scan_id === "string" ? body.scan_id : "";
    const kind = body.kind;
    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(scanId)) return json({ error: "Invalid scan reference." }, 400);
    if (!["message", "url", "upi"].includes(kind)) return json({ error: "Unsupported input type." }, 400);
    if (!input || input.length > 5000) return json({ error: "Input must contain 1–5000 characters." }, 400);

    const { data: ownedScan, error: scanError } = await userClient
      .from("payshield_scans")
      .select("id")
      .eq("id", scanId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (scanError || !ownedScan) return json({ error: "Saved scan not found." }, 404);

    const prompt = `You are a Senior Cybercrime Intelligence & Financial Fraud Forensics Investigator. Your job is to analyze untrusted text, URLs, or UPI IDs for subtle, well-planned social engineering, phishing, malware, or payment fraud tactics.

### FORENSIC TAXONOMY & THREAT VECTORS TO DETECT:
1. **Digital Arrest & Legal Coercion**:
   - Impersonation of CBI, ED, Police, Customs, Supreme Court, TRAI, DoT.
   - Claims of narcotics found in parcels (FedEx/DHL/customs), illegal SIM cards, money laundering, court summons/warrants.
   - Demands for video interrogation, secrecy, or "verifying assets" by transferring funds to a "government/RBI safe custody account".

2. **Utility & Essential Service Disconnection Urgency**:
   - Threats of electricity, gas, or water disconnection tonight (often specifying 9:30 PM).
   - Asking the user to call an unverified officer number or download a malicious APK / quick-support tool.

3. **Courier, Delivery & Post Smishing**:
   - Fake India Post, BlueDart, Delhivery, DTDC, FedEx SMS alleging delivery failure due to wrong address or unpaid customs/redelivery fee (e.g. ₹25 or ₹50).
   - Links to fake address-update portals designed to harvest full card details or OTPs.

4. **Task-Based & Telegram Investment Scams**:
   - Unsolicited WhatsApp/Telegram offers for "work from home", rating hotels/apps, liking YouTube videos for ₹1,500–₹5,000/day.
   - Initial small payouts to build trust followed by demands to deposit money into VIP investment plans or crypto pools.

5. **Inverted UPI Collect & QR Scams**:
   - Fake buyers on OLX/Marketplace or fake landlords sending a UPI QR code or "Collect Request" claiming: "Scan this or enter your UPI PIN to receive money / advance payment".
   - CRITICAL RULE: A UPI PIN is strictly and exclusively used to DEBIT funds. Entering a PIN to "receive" money is ALWAYS a scam.

6. **UPI Mandate / Autopay Traps**:
   - Setting up recurring debit mandates disguised as a refund approval or verification authorization.

7. **Phishing & Infrastructure Deceptions**:
   - Use of free cloud infrastructure for hosting credential harvesters (*.pages.dev, *.web.app, *.firebaseapp.com, *.vercel.app, *.workers.dev, *.glitch.me, *.ngrok-free.app, *.s3.amazonaws.com).
   - Combosquatting / typosquatting (e.g. sbi-kyc-update, hdfc-rewards, phonepe-support, incometax-refund, pan-aadhaar-link).
   - Use of open redirects, URL shorteners, or deceptive URL paths to conceal destinations.

8. **Fake Customer Support & Nodal VPAs**:
   - Unofficial UPI handles impersonating brand or bank customer care (e.g. *.support@*, *.care@*, *.nodal@*, *.helpdesk@*, *.refund@*).

### INSTRUCTIONS:
- Analyze the user-supplied content deeply. Look beyond surface grammar: detect psychological manipulation (fear, urgency, greed, authority, artificial deadlines).
- Even if the message looks professional, polite, or uses standard corporate templates, identify the underlying trap or procedural deviation from how authentic institutions operate.
- Return ONLY valid JSON with this exact shape:
{
  "risk_level": "low" | "medium" | "high",
  "risk_score": <number 0-10>,
  "summary": "<2-3 sentence forensic synthesis identifying the exact scam vector, psychological pretext, and real-world hazard>",
  "attack_vector": "<Primary attack archetype, e.g. Phishing / Brand Impersonation, Digital Arrest Coercion, Inverted UPI Collect Fraud, Courier Delivery Smishing, Task/Job Investment Scam, Fake Support Impersonation, or None Detected>",
  "additional_findings": [
    {
      "title": "<Concise threat label>",
      "detail": "<Specific technical or psychological reason why this is dangerous>",
      "severity": "high" | "medium" | "info",
      "evidence": "<Exact snippet from the input that triggered this finding>"
    }
  ],
  "preventative_advice": [
    "<Concrete, practical action step for the user, e.g. Call 1930 / cybercrime.gov.in, check official app only, never enter PIN to receive money>"
  ]
}

Input type: ${kind}
Rule-based findings already detected: ${JSON.stringify(Array.isArray(body.local_findings) ? body.local_findings.slice(0, 12) : [])}
Untrusted content to evaluate:
<user_content>
${input}
</user_content>`;

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(geminiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                risk_level: { type: "STRING", enum: ["low", "medium", "high"] },
                risk_score: { type: "INTEGER" },
                summary: { type: "STRING" },
                attack_vector: { type: "STRING" },
                additional_findings: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      title: { type: "STRING" },
                      detail: { type: "STRING" },
                      severity: { type: "STRING", enum: ["high", "medium", "info"] },
                      evidence: { type: "STRING" },
                    },
                    required: ["title", "detail", "severity", "evidence"],
                  },
                },
                preventative_advice: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["risk_level", "risk_score", "summary", "additional_findings"],
            },
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Gemini request failed:", aiResponse.status, errorText.slice(0, 500));
      return json({ error: "The AI provider could not complete the review. Your rule-based scan is still saved." }, 502);
    }

    const aiJson = await aiResponse.json();
    const text = aiJson?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "The AI provider returned an unreadable result. Your rule-based scan is still saved." }, 502);
    }

    const analysis = {
      risk_level: normalizeRisk(parsed.risk_level),
      risk_score: clampScore(parsed.risk_score),
      summary: String(parsed.summary ?? "The AI review did not provide a summary.").slice(0, 1200),
      attack_vector: parsed.attack_vector ? String(parsed.attack_vector).slice(0, 100) : undefined,
      additional_findings: Array.isArray(parsed.additional_findings)
        ? parsed.additional_findings.slice(0, 8).map((f: any) => ({
            title: String(f.title ?? "Additional indicator").slice(0, 100),
            detail: String(f.detail ?? "").slice(0, 500),
            severity: ["high", "medium", "info"].includes(f.severity) ? f.severity : "info",
            evidence: String(f.evidence ?? "").slice(0, 180),
          }))
        : [],
      preventative_advice: Array.isArray(parsed.preventative_advice)
        ? parsed.preventative_advice.slice(0, 4).map((a: any) => String(a).slice(0, 200))
        : [],
    };

    // Combine conservatively: AI may raise concern, but cannot lower a rule-based warning.
    const { data: existing } = await userClient
      .from("payshield_scans")
      .select("risk_level, risk_score, findings")
      .eq("id", scanId)
      .single();
    const rank = { low: 0, medium: 1, high: 2 };
    const finalRisk = rank[analysis.risk_level] >= rank[normalizeRisk(existing?.risk_level)]
      ? analysis.risk_level
      : normalizeRisk(existing?.risk_level);
    const finalScore = Math.max(analysis.risk_score, clampScore(existing?.risk_score));

    const { error: updateError } = await userClient
      .from("payshield_scans")
      .update({
        risk_level: finalRisk,
        risk_score: finalScore,
        ai_summary: analysis.summary,
        ai_used: true,
        findings: [
          ...(Array.isArray(existing?.findings) ? existing.findings : []),
          ...analysis.additional_findings,
        ],
      })
      .eq("id", scanId)
      .eq("user_id", userData.user.id);
    if (updateError) return json({ error: "AI review completed, but the saved report could not be updated." }, 500);

    return json({ analysis: { ...analysis, risk_level: finalRisk, risk_score: finalScore } });
  } catch (error) {
    console.error("PayShield function error:", error);
    return json({ error: "Unexpected PayShield server error." }, 500);
  }
});
