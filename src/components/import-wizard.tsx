"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { IMPORT_FIELDS, guessMapping, parseDate, parseNumber, type ImportFieldKey, type ImportRow } from "@/lib/import-fields";
import { finishImport, getCompanyKeys, importClients, skipOnboarding } from "@/app/actions/import";
import { normalizeCompany } from "@/lib/company-key";

type Mapping = Record<ImportFieldKey, string | null>;
type Sheet = { name: string; headers: string[]; rows: Record<string, unknown>[] };

const CHUNK = 500;

export function ImportWizard({ firstTime, doneHref }: { firstTime: boolean; doneHref: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; merged: number; skipped: number } | null>(null);
  const [existingKeys, setExistingKeys] = useState<Set<string> | null>(null);

  async function onFile(file: File) {
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
      if (rows.length === 0) throw new Error("That sheet looks empty.");
      const headers = Object.keys(rows[0]).filter((h) => !h.startsWith("__EMPTY"));
      setSheet({ name: file.name, headers, rows });
      setMapping(guessMapping(headers));
      const existing = await getCompanyKeys();
      if (existing.error) setError(existing.error);
      else setExistingKeys(new Set(existing.keys));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file. Upload an .xlsx or .csv.");
    }
  }

  const parsed = useMemo<ImportRow[]>(() => {
    if (!sheet || !mapping) return [];
    return sheet.rows.map((raw) => {
      const row: ImportRow = {};
      for (const f of IMPORT_FIELDS) {
        const col = mapping[f.key];
        if (!col) continue;
        const v = raw[col];
        row[f.key] = f.kind === "date" ? parseDate(v) : f.kind === "number" ? parseNumber(v) : v == null ? null : String(v).trim();
      }
      return row;
    });
  }, [sheet, mapping]);

  const valid = useMemo(() => parsed.filter((r) => r.company), [parsed]);

  // Preview: how many are new, already in the list, or repeated within this file.
  const stats = useMemo(() => {
    const seen = new Set<string>();
    let fresh = 0, already = 0, repeated = 0;
    for (const r of valid) {
      const k = normalizeCompany(String(r.company));
      if (seen.has(k)) { repeated++; continue; }
      seen.add(k);
      if (existingKeys?.has(k)) already++;
      else fresh++;
    }
    return { fresh, already, repeated };
  }, [valid, existingKeys]);

  async function runImport() {
    setError(null);
    setProgress({ done: 0, total: valid.length });
    let inserted = 0, updated = 0, merged = 0;
    let skipped = parsed.length - valid.length;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const res = await importClients(valid.slice(i, i + CHUNK));
      if (res.error) {
        setError(res.error);
        setProgress(null);
        return;
      }
      inserted += res.inserted ?? 0;
      updated += res.updated ?? 0;
      merged += res.merged ?? 0;
      skipped += res.skipped ?? 0;
      setProgress({ done: Math.min(i + CHUNK, valid.length), total: valid.length });
    }
    const fin = await finishImport();
    if (fin.error) setError(fin.error);
    setResult({ inserted, updated, merged, skipped });
    setProgress(null);
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      IMPORT_FIELDS.map((f) => f.label),
      ["Shree Ganesh Exports", "Ramesh Patel", "9820012345", "ramesh@example.com", "Andheri", "Unit 4, MIDC, Andheri East", "Textiles", 42, "15/06/2019", "02/10/2026", "12/09/2026", "20/10/2026", "", "Prefers morning calls"],
      ["Kiran Pharma Pvt Ltd", "Sneha Iyer", "9833098765", "", "Powai", "", "Pharma", 8, "01/03/2023", "18/04/2026", "05/01/2026", "", "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master list");
    XLSX.writeFile(wb, "polestar-master-list-template.xlsx");
  }

  async function skip() {
    await skipOnboarding();
    router.push(doneHref);
  }

  if (result) {
    return (
      <div className="card space-y-4 p-5">
        <div>
          <p className="text-lg font-bold">{result.inserted} new {result.inserted === 1 ? "client" : "clients"} added</p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {result.updated > 0 && <li>{result.updated} already in your list: updated with newer details</li>}
            {result.merged > 0 && <li>{result.merged} repeated rows in the file merged</li>}
            {result.skipped > 0 && <li>{result.skipped} rows skipped (no company name)</li>}
            {result.inserted + result.updated === 0 && <li>Nothing new: everything was already in your list.</li>}
          </ul>
        </div>
        <p className="text-sm text-muted">Every client now has a priority tier (A, B or C) based on shipment volume and how recently they shipped.</p>
        <button className="btn-primary w-full" onClick={() => { router.push(doneHref); router.refresh(); }}>
          {firstTime ? "Build my day" : "Done"}
        </button>
      </div>
    );
  }

  if (!sheet || !mapping) {
    return (
      <div className="space-y-4">
        <label className="card flex cursor-pointer flex-col items-center gap-3 border-dashed px-5 py-10 text-center">
          <Upload className="text-brand" />
          <span className="font-semibold">Choose your master list</span>
          <span className="text-sm text-muted">Excel (.xlsx, .xls) or CSV</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={downloadTemplate} className="btn-secondary w-full">
          <Download size={16} /> Download the template
        </button>
        {firstTime && (
          <button onClick={skip} className="btn-ghost w-full">I&apos;ll add clients manually</button>
        )}
      </div>
    );
  }

  const preview = valid.slice(0, 3);
  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3 p-4">
        <FileSpreadsheet className="shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{sheet.name}</p>
          <p className="text-sm text-muted">{sheet.rows.length} rows · {valid.length} with a company name</p>
        </div>
        <button className="btn-ghost px-2" onClick={() => { setSheet(null); setMapping(null); }}>Change</button>
      </div>

      <div className="card divide-y divide-line">
        <p className="p-4 text-sm text-muted">Check that each field points at the right column in your sheet.</p>
        {IMPORT_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-36 shrink-0 text-sm font-medium">
              {f.label}
              {"required" in f && f.required && <span className="text-red-600"> *</span>}
            </span>
            <select
              className="input min-h-10 text-sm"
              value={mapping[f.key] ?? ""}
              onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
            >
              <option value="">Not in my sheet</option>
              {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        ))}
      </div>

      {preview.length > 0 && (
        <div className="card p-4">
          <p className="label">Preview</p>
          <ul className="space-y-2 text-sm">
            {preview.map((r, i) => (
              <li key={i}>
                <span className="font-semibold">{r.company}</span>
                <span className="text-muted"> · {r.area ?? "no area"} · {r.total_shipments ?? 0} shipments · last {r.last_shipment_date ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mapping.company && valid.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card p-3"><p className="text-xl font-bold text-green-700">{stats.fresh}</p><p className="text-[11px] text-muted">New</p></div>
          <div className="card p-3"><p className="text-xl font-bold">{existingKeys ? stats.already : "…"}</p><p className="text-[11px] text-muted">Already in your list</p></div>
          <div className="card p-3"><p className="text-xl font-bold">{stats.repeated}</p><p className="text-[11px] text-muted">Repeated in file</p></div>
        </div>
      )}
      {(stats.already > 0 || stats.repeated > 0) && (
        <p className="text-xs text-muted">No duplicates will be created. Clients already in your list get any missing details and newer dates from this file; nothing already there is erased.</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={!mapping.company || valid.length === 0 || !!progress} onClick={runImport}>
        {progress ? `Importing ${progress.done}/${progress.total}…` : stats.fresh > 0 ? `Add ${stats.fresh} new clients${stats.already ? ` · update ${stats.already}` : ""}` : `Update ${stats.already} existing clients`}
      </button>
    </div>
  );
}
