// Supabase Edge Function: parse-statement
//
// Smart Import pipeline for PDF bank statements and photographed/scanned
// statements (images). CSV is parsed entirely client-side with PapaParse
// (see src/components/SmartImportModal.tsx) since it needs no OCR.
//
// Pipeline:
//   1. PDF  -> try direct text extraction with pdfjs-dist.
//              If that yields no usable transaction lines, fall back to
//              OCR.Space (handles scanned/image-only PDFs, up to 3 pages
//              on the free tier).
//   2. Image -> always goes through OCR.Space.
//   3. Extracted text -> generic line-based parser that recognizes the
//      common "date | narration | debit | credit | balance"-style layout
//      shared by SBI, HDFC, ICICI, Axis, PNB, BoB, Union, UCO, Canara,
//      IDFC, Kotak, AU, Federal, Indian Bank, IOB, and most other
//      structured statements — plus best-effort bank-name detection from
//      header keywords.
//
// Secrets required: OCR_SPACE_API_KEY (get a free key at ocr.space/ocrapi)
// Deploy: supabase functions deploy parse-statement
// Set secret: supabase secrets set OCR_SPACE_API_KEY=your_key_here

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  type: "income" | "expense";
  amount: number;
  description: string;
  category: string;
  payment_method: string;
  raw_line: string;
}

const BANK_KEYWORDS: Record<string, string[]> = {
  SBI: ["state bank of india", "sbi"],
  HDFC: ["hdfc bank", "hdfc"],
  ICICI: ["icici bank", "icici"],
  Axis: ["axis bank"],
  PNB: ["punjab national bank", "pnb"],
  "Bank of Baroda": ["bank of baroda", "bob"],
  "Union Bank": ["union bank of india"],
  UCO: ["uco bank"],
  Canara: ["canara bank"],
  IDFC: ["idfc first bank", "idfc bank"],
  Kotak: ["kotak mahindra bank", "kotak"],
  AU: ["au small finance bank"],
  Federal: ["federal bank"],
  "Indian Bank": ["indian bank"],
  "Indian Overseas Bank": ["indian overseas bank", "iob"],
};

function detectBank(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [bank, keywords] of Object.entries(BANK_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return bank;
  }
  return null;
}

// Matches a leading date in dd/mm/yyyy, dd-mm-yyyy, or yyyy-mm-dd form.
const DATE_RE = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/;
// Matches money amounts like 1,234.56 or 1234.56 or 1234
const AMOUNT_RE = /[\d,]+\.\d{2}|[\d,]{3,}/g;

function normalizeDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, d, m] = dmy;
    let y = dmy[3];
    if (y.length === 2) y = `20${y}`;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${y}-${month}-${day}`;
    }
  }
  return null;
}

function guessCategory(description: string, type: "income" | "expense"): string {
  const d = description.toLowerCase();
  if (type === "income") {
    if (/salary|payroll/.test(d)) return "salary";
    if (/interest|dividend/.test(d)) return "dividends";
    if (/refund|reversal/.test(d)) return "refund";
    return "other_income";
  }
  if (/swiggy|zomato|restaurant|food|cafe/.test(d)) return "food";
  if (/uber|ola|fuel|petrol|diesel|transport|metro/.test(d)) return "transport";
  if (/rent|housing/.test(d)) return "housing";
  if (/electricity|water bill|utility|utilities|recharge|broadband/.test(d)) return "utilities";
  if (/amazon|flipkart|myntra|shopping/.test(d)) return "shopping";
  if (/hospital|pharmacy|medical|clinic/.test(d)) return "health";
  if (/school|college|tuition|course|education/.test(d)) return "education";
  if (/netflix|spotify|prime|subscription/.test(d)) return "subscriptions";
  if (/emi|loan/.test(d)) return "debt_payment";
  if (/atm|withdrawal|upi|neft|imps|rtgs|transfer/.test(d)) return "other_expense";
  return "other_expense";
}

/** Parses raw statement text (from PDF text layer or OCR) into transaction rows. */
function parseStatementText(text: string): ParsedTransaction[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ParsedTransaction[] = [];

  for (const line of lines) {
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;
    const date = normalizeDate(dateMatch[0]);
    if (!date) continue;

    const amounts = line.match(AMOUNT_RE);
    if (!amounts || amounts.length === 0) continue;

    // Look for explicit CR/DR/credit/debit markers near the amount.
    const isCredit = /\bcr\b|\bcredit\b/i.test(line);
    const isDebit = /\bdr\b|\bdebit\b/i.test(line);

    // Take the largest plausible transaction amount on the line that
    // isn't obviously a running balance (heuristic: not the last number
    // when there are 3+ numbers, since layout is usually debit,credit,balance
    // or amount,balance).
    const numericAmounts = amounts.map((a) => Number(a.replace(/,/g, ""))).filter((n) => n > 0);
    if (numericAmounts.length === 0) continue;
    const amount = numericAmounts.length >= 2 ? numericAmounts[numericAmounts.length - 2] : numericAmounts[0];
    if (!amount || amount <= 0) continue;

    const description = line
      .replace(dateMatch[0], "")
      .replace(AMOUNT_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 200) || "Imported transaction";

    const type: "income" | "expense" = isCredit && !isDebit ? "income" : "expense";

    results.push({
      date,
      type,
      amount,
      description,
      category: guessCategory(description, type),
      payment_method: "bank_transfer",
      raw_line: line,
    });
  }

  return results;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const doc = await pdfjsLib.getDocument({ data: bytes, useSystemFonts: true }).promise;
    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => ("str" in item ? item.str : "")).join(" ");
      fullText += pageText + "\n";
    }
    return fullText;
  } catch {
    return "";
  }
}

async function ocrSpaceExtract(base64: string, fileType: "pdf" | "image", apiKey: string): Promise<string> {
  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("base64Image", `data:${fileType === "pdf" ? "application/pdf" : "image/png"};base64,${base64}`);
  form.append("filetype", fileType === "pdf" ? "PDF" : "PNG");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("isTable", "true");

  const res = await fetch("https://apipro1.ocr.space/parse/image", { method: "POST", body: form });
  if (!res.ok) throw new Error(`OCR.Space request failed (${res.status})`);
  const json = await res.json();
  if (json.IsErroredOnProcessing) {
    throw new Error(json.ErrorMessage?.[0] || "OCR.Space could not process this file");
  }
  return (json.ParsedResults ?? []).map((r: any) => r.ParsedText || "").join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Enforce account blocks on the server, not only in the React UI.
    const { data: isBlocked, error: blockError } = await userClient.rpc("is_user_blocked");
    if (blockError) {
      console.error("parse-statement: could not verify account status", blockError.message);
      return new Response(JSON.stringify({ error: "Unable to verify account status. Please try again." }), {
        status: 503,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (isBlocked) {
      return new Response(JSON.stringify({ error: "Your account is temporarily blocked from this action." }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { file_base64, file_type, file_name } = body as { file_base64: string; file_type: "pdf" | "image"; file_name: string };

    if (!file_base64 || !file_type) {
      return new Response(JSON.stringify({ error: "file_base64 and file_type are required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let text = "";
    let usedOcr = false;

    if (file_type === "pdf") {
      const bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
      text = await extractPdfText(bytes);
    }

    const rowsFromDirectExtraction = text ? parseStatementText(text) : [];

    if (file_type === "image" || rowsFromDirectExtraction.length === 0) {
      const apiKey = Deno.env.get("OCR_SPACE_API_KEY");
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error:
              file_type === "image"
                ? "OCR_SPACE_API_KEY is not configured on the server, so image imports are unavailable."
                : "No transaction table could be read directly from this PDF, and OCR_SPACE_API_KEY is not configured for the OCR fallback.",
          }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
      text = await ocrSpaceExtract(file_base64, file_type, apiKey);
      usedOcr = true;
    }

    const rows = usedOcr ? parseStatementText(text) : rowsFromDirectExtraction;
    const bank = detectBank(text);

    return new Response(
      JSON.stringify({
        success: true,
        bank_detected: bank,
        used_ocr: usedOcr,
        rows_detected: rows.length,
        rows,
        file_name,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
