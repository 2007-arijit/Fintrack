import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Download,
  FileText,
  Image as ImageIcon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  FileSpreadsheet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface SmartImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportSource = "csv" | "pdf" | "image";

interface ParsedRow {
  date: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  description: string;
  payment_method: string;
  custom_category: string;
  valid: boolean;
  error?: string;
}

const TEMPLATE_HEADERS = ["date", "type", "amount", "category", "description", "payment_method"];

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed ? trimmed : null;
  }
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    const candidate = `${y}-${month}-${day}`;
    const parsed = new Date(`${candidate}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate) return candidate;
  }
  return null;
}

function parseAmount(raw: string | number): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const cleaned = String(raw).replace(/[₹$€£,\s]/g, "");
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

function parseType(raw: string): "income" | "expense" | null {
  const t = raw?.toLowerCase().trim();
  if (t === "income") return "income";
  if (t === "expense") return "expense";
  return null;
}

// Small, fast, non-cryptographic hash — good enough to fingerprint a
// transaction for dedup purposes, without pulling in a crypto library.
function fingerprint(userId: string, row: { date: string; type: string; amount: number; description: string }) {
  const raw = `${userId}|${row.date}|${row.type}|${row.amount}|${row.description.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

export function SmartImportModal({ open, onOpenChange }: SmartImportModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<ImportSource | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [bankDetected, setBankDetected] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const parsed = useMemo<ParsedRow[]>(() => {
    return rawRows.map((row) => {
      const date = parseDate(row.date || row.Date || "");
      const type = parseType(row.type || row.Type || "");
      const amount = parseAmount(row.amount || row.Amount || "");
      const category = (row.category || row.Category || "").trim();
      const description = (row.description || row.Description || "").trim();
      const payment_method = (row.payment_method || row["Payment Method"] || row.payment || "").trim() || "other";
      const custom_category = (row.custom_category || "").trim();
      const valid = !!date && !!type && !!amount;
      return {
        date: date || "",
        type: type || "expense",
        amount: amount || 0,
        category: category || (type ? "other_" + type : "other_expense"),
        description,
        payment_method,
        custom_category,
        valid,
        error: !date ? "Invalid date" : !type ? "Invalid type" : !amount ? "Invalid amount" : undefined,
      };
    });
  }, [rawRows]);

  const validRows = parsed.filter((r) => r.valid);
  const invalidRows = parsed.filter((r) => !r.valid);

  const reset = () => {
    setSource(null);
    setFileName(null);
    setRawRows([]);
    setProcessingError(null);
    setBankDetected(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  const MAX_CSV_ROWS = 10000;

  const handleCsvFile = (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      setProcessingError("CSV files must be 8 MB or smaller.");
      return;
    }
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > MAX_CSV_ROWS) {
          setProcessingError(`CSV files can contain at most ${MAX_CSV_ROWS.toLocaleString()} rows.`);
          setRawRows([]);
          return;
        }
        setRawRows(results.data as Record<string, string>[]);
      },
      error: (error) => setProcessingError(error.message || "Could not read this CSV file."),
    });
  };

  const handleDocumentFile = async (file: File, type: "pdf" | "image") => {
    if (file.size > MAX_IMPORT_BYTES) {
      setProcessingError("PDF and image files must be 8 MB or smaller.");
      return;
    }
    setFileName(file.name);
    setProcessing(true);
    setProcessingError(null);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-statement", {
        body: { file_base64: base64, file_type: type, file_name: file.name },
      });
      if (error) {
        let message = error.message || "Import processing failed";
        // supabase-js only gives a generic "non-2xx status code" message by
        // default; the real error is in the response body, reachable via
        // error.context (a Response object) on FunctionsHttpError.
        if (error.context && typeof error.context.json === "function") {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {
            // response wasn't JSON; fall back to the generic message
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      const rows = (data.rows ?? []) as {
        date: string;
        type: "income" | "expense";
        amount: number;
        description: string;
        category: string;
        payment_method: string;
      }[];

      if (rows.length === 0) {
        setProcessingError(
          "No transactions could be detected in this file. Try a clearer scan, or use CSV import instead."
        );
        setProcessing(false);
        return;
      }

      setBankDetected(data.bank_detected ?? null);
      setRawRows(
        rows.map((r) => ({
          date: r.date,
          type: r.type,
          amount: String(r.amount),
          category: r.category,
          description: r.description,
          payment_method: r.payment_method,
        }))
      );
    } catch (e: any) {
      setProcessingError(e.message || "Could not process this file");
    } finally {
      setProcessing(false);
    }
  };

  const handleFile = (file: File) => {
    if (source === "csv") handleCsvFile(file);
    else if (source === "pdf") handleDocumentFile(file, "pdf");
    else if (source === "image") handleDocumentFile(file, "image");
  };

  const downloadTemplate = () => {
    const csv =
      TEMPLATE_HEADERS.join(",") +
      "\n2025-01-15,expense,500,food,Lunch at cafe,cash\n2025-01-16,income,3000,salary,Monthly salary,bank_transfer";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!user || validRows.length === 0) return;
    setImporting(true);
    try {
      // Fingerprint every valid row, and drop in-batch duplicates first.
      const withHash = validRows.map((r) => ({
        row: r,
        hash: fingerprint(user.id, { date: r.date, type: r.type, amount: r.amount, description: r.description }),
      }));
      const seen = new Set<string>();
      const deduped = withHash.filter(({ hash }) => {
        if (seen.has(hash)) return false;
        seen.add(hash);
        return true;
      });

      // Check which fingerprints already exist for this user.
      const allHashes = deduped.map((d) => d.hash);
      const existing = new Set<string>();
      const CHECK_BATCH = 200;
      for (let i = 0; i < allHashes.length; i += CHECK_BATCH) {
        const chunk = allHashes.slice(i, i + CHECK_BATCH);
        const { data, error } = await supabase
          .from("transactions")
          .select("import_hash")
          .eq("user_id", user.id)
          .in("import_hash", chunk);
        if (error) throw error;
        (data ?? []).forEach((d: any) => d.import_hash && existing.add(d.import_hash));
      }

      const toInsert = deduped.filter((d) => !existing.has(d.hash));
      const duplicateCount = validRows.length - toInsert.length;

      const rows = toInsert.map(({ row, hash }) => ({
        user_id: user.id,
        type: row.type,
        amount: row.amount,
        category: row.category,
        custom_category: row.custom_category || null,
        description: row.description || null,
        date: row.date,
        payment_method: row.payment_method,
        import_hash: hash,
      }));

      const INSERT_BATCH = 100;
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const { error } = await supabase.from("transactions").insert(rows.slice(i, i + INSERT_BATCH));
        if (error) throw error;
      }

      await supabase.from("uploaded_imports").insert({
        user_id: user.id,
        file_name: fileName || "import",
        source_type: source || "csv",
        bank_detected: bankDetected,
        rows_detected: parsed.length,
        rows_imported: rows.length,
        rows_duplicate: duplicateCount,
      });

      queryClient.invalidateQueries({ queryKey: ["transactions"] });

      if (rows.length === 0) {
        toast.info(`All ${duplicateCount} transaction(s) were already imported — nothing new to add.`);
      } else {
        toast.success(
          `${rows.length} transaction(s) imported${duplicateCount > 0 ? `, ${duplicateCount} duplicate(s) skipped` : ""}`
        );
      }
      handleClose(false);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const sourceConfig: Record<ImportSource, { label: string; accept: string; icon: typeof FileText }> = {
    csv: { label: "CSV File", accept: ".csv", icon: FileSpreadsheet },
    pdf: { label: "PDF Statement", accept: ".pdf", icon: FileText },
    image: { label: "Image (Photo/Scan)", accept: "image/*", icon: ImageIcon },
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            {source && (
              <Button variant="ghost" size="icon" className="h-6 w-6 -ml-1" onClick={reset}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            Import Transactions
          </DialogTitle>
        </DialogHeader>

        {!source && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Choose how you'd like to import transactions.</p>
            {(Object.keys(sourceConfig) as ImportSource[]).map((key) => {
              const cfg = sourceConfig[key];
              const Icon = cfg.icon;
              return (
                <button
                  key={key}
                  onClick={() => setSource(key)}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-secondary/40 hover:bg-secondary/70 transition-colors px-4 py-3 text-left"
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-medium">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {source && rawRows.length === 0 && !processing && (
          <>
            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-secondary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept={sourceConfig[source].accept}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Tap to select a {source === "csv" ? ".csv file" : source === "pdf" ? "PDF statement" : "photo or scan"}
              </p>
            </div>

            {source === "csv" && (
              <button onClick={downloadTemplate} className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto">
                <Download className="h-3 w-3" /> Download CSV Template
              </button>
            )}

            {processingError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {processingError}
              </p>
            )}
          </>
        )}

        {processing && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {source === "pdf" ? "Reading your statement…" : "Running OCR on your image…"}
            </p>
          </div>
        )}

        {rawRows.length > 0 && (
          <div className="space-y-3">
            {fileName && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{fileName}</span>
                </span>
                <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={reset}>
                  Change
                </Button>
              </div>
            )}
            {bankDetected && (
              <p className="text-xs text-muted-foreground">Detected bank: <span className="text-foreground font-medium">{bankDetected}</span></p>
            )}
            <div className="flex items-center gap-4 text-sm">
              {validRows.length > 0 && (
                <span className="flex items-center gap-1 text-success">
                  <CheckCircle2 className="h-4 w-4" /> {validRows.length} rows ready
                </span>
              )}
              {invalidRows.length > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {invalidRows.length} skipped
                </span>
              )}
            </div>
            <div className="overflow-x-auto max-h-40 border border-border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-right">Amount</th>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-2">{r.date || "—"}</td>
                      <td className="p-2">{r.type}</td>
                      <td className="p-2 text-right">{r.amount}</td>
                      <td className="p-2 truncate max-w-[120px]">{r.description || "—"}</td>
                      <td className="p-2">
                        {r.valid ? (
                          <CheckCircle2 className="h-3 w-3 text-success" />
                        ) : (
                          <span className="text-destructive">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="w-full" disabled={validRows.length === 0 || importing} onClick={handleImport}>
              {importing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Import {validRows.length} Transaction{validRows.length !== 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
          }
           
