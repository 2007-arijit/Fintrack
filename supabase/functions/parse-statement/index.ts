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

// ISO dates are checked first so a YYYY-MM-DD value cannot be partially
// consumed by the day-first alternative.
const DATE_RE = /(\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b)/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 ||
      !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function readLimitedBody(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) throw new Error("INVALID_BODY");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
// Matches money amounts like 1,234.56 or 1234.56 or 1234
const AMOUNT_RE = /[\d,]+\.\d{2}|[\d,]{3,}/g;

function normalizeDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, yearText, monthText, dayText] = iso;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${yearText}-${monthText.padStart(2, "0")}-${dayText.padStart(2, "0")}`;
  }
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = `20${y}`;
    const dayNumber = Number(d);
    const monthNumber = Number(m);
    const yearNumber = Number(y);
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    if (isValidCalendarDate(yearNumber, monthNumber, dayNumber)) {
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

    const amountSource = line.replace(dateMatch[0], " ");
    const amounts = amountSource.match(AMOUNT_RE);
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

    const description = amountSource
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
    if (doc.numPages > 3) throw new Error("PDF imports are limited to 3 pages. Split the statement into smaller files.");
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item: any) => typeof item?.str === "string" && item.str.trim())
        .map((item: any) => ({
          text: item.str.trim(),
          x: Number(item.transform?.[4] ?? 0),
          y: Number(item.transform?.[5] ?? 0),
        }))
        .sort((a, b) => b.y - a.y || a.x - b.x);

      const lines: { y: number; chunks: { x: number; text: string }[] }[] = [];
      for (const item of items) {
        let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 2.5);
        if (!line) {
          line = { y: item.y, chunks: [] };
          lines.push(line);
        }
        line.chunks.push({ x: item.x, text: item.text });
      }
      lines.sort((a, b) => b.y - a.y);
      pageTexts.push(lines.map((line) => line.chunks.sort((a, b) => a.x - b.x).map((chunk) => chunk.text).join(" ")).join("\n"));
    }
    return pageTexts.join("\n");
  } catch (error) {
    if (error instanceof Error && error.message.includes("limited to 3 pages")) throw error;
    return "";
  }
}

async function ocrSpaceExtract(base64: string, fileType: "pdf" | "image", apiKey: string, imageMime = "image/png"): Promise<string> {
  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("base64Image", `data:${fileType === "pdf" ? "application/pdf" : imageMime};base64,${base64}`);
  form.append("filetype", fileType === "pdf" ? "PDF" : imageMime === "image/jpeg" ? "JPG" : "PNG");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("isTable", "true");

  const res = await fetch("https://apipro1.ocr.space/parse/image", { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
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
    const maxRequestBytes = 11_500_000;
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > maxRequestBytes) {
      return new Response(JSON.stringify({ error: "Upload exceeds the 8 MB file limit." }), {
        status: 413, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !ANON_KEY) {
      return new Response(JSON.stringify({ error: "Server configuration is incomplete." }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
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

    let body: unknown = null;
    try {
      body = JSON.parse(await readLimitedBody(req, maxRequestBytes));
    } catch (error) {
      if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
        return new Response(JSON.stringify({ error: "Upload exceeds the 8 MB file limit." }), {
          status: 413, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid request body." }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    const { file_base64, file_type, file_name } = body as { file_base64: string; file_type: "pdf" | "image"; file_name: string };

    if (typeof file_base64 !== "string" || !file_base64 || !["pdf", "image"].includes(file_type)) {
      return new Response(JSON.stringify({ error: "file_base64 and file_type are required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file_base64) || file_base64.length > 11_200_000) {
      return new Response(JSON.stringify({ error: "Invalid or oversized file data." }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
    } catch {
      return new Response(JSON.stringify({ error: "The uploaded file could not be decoded." }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (bytes.byteLength > 8 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Upload exceeds the 8 MB file limit." }), {
        status: 413, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    let imageMime = "image/png";
    if (file_type === "pdf") {
      const header = new TextDecoder().decode(bytes.slice(0, 5));
      if (header !== "%PDF-") return new Response(JSON.stringify({ error: "The file is not a valid PDF." }), {
        status: 415, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    } else {
      const isPng = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
      const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!isPng && !isJpeg) return new Response(JSON.stringify({ error: "Only PNG and JPEG images are supported." }), {
        status: 415, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
      imageMime = isJpeg ? "image/jpeg" : "image/png";
    }

    const safeFileName = typeof file_name === "string"
      ? file_name.replace(/[\\/\0-\x1f]/g, "_").slice(0, 120)
      : "statement";

    const { data: withinQuota, error: quotaError } = await userClient.rpc("consume_user_daily_quota", { _function_name: "statement_parse" });
    if (quotaError) {
      console.error("parse-statement: quota check failed", quotaError.message);
      return new Response(JSON.stringify({ error: "Unable to verify today's import limit." }), {
        status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!withinQuota) return new Response(JSON.stringify({ error: "Daily statement parsing limit reached. Try again tomorrow." }), {
      status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

    let text = "";
    let usedOcr = false;

    if (file_type === "pdf") text = await extractPdfText(bytes);

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
      text = await ocrSpaceExtract(file_base64, file_type, apiKey, imageMime);
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
        file_name: safeFileName,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: e instanceof Error && e.message.includes("limited to 3 pages") ? 413 : 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
