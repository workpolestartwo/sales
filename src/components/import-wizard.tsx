"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { IMPORT_FIELDS, guessMapping, parseDate, parseNumber, type ImportFieldKey, type ImportRow } from "@/lib/import-fields";
import { finishImport, importClients, skipOnboarding } from "@/app/actions/import";
import { createAssignments, notifyBatch } from "@/app/actions/assignments";
import { createClient } from "@/lib/supabase/client";
import { normalizeCompany } from "@/lib/company-key";
import { findRepColumn, matchMember, type Presence, type TeamMember } from "@/lib/team-match";

type Mapping = Record<ImportFieldKey, string | null>;
type Sheet = { name: string; headers: string[]; rows: Record<string, unknown>[] };
type Entry = { row: ImportRow; rep: string };

const CHUNK = 500;
const cell = (v: unknown) => (v == null ? "" : String(v).trim());
/** "DEEPAK  SINGH" and "Deepak Singh" are the same salesperson. */
const repKey = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

interface Result {
  updated: number;
  requests: { name: string; count: number; mine: boolean }[];
  skipped: number;
}

/**
 * One upload for everything. Without a salesperson column every client is yours.
 * With one, your rows go straight into your list and teammates' rows become approval
 * requests for them. A client already with anyone (or awaiting anyone's approval) is skipped.
 */
export function ImportWizard({ firstTime, doneHref, team, meId }: { firstTime: boolean; doneHref: string; team: TeamMember[]; meId: string }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [repCol, setRepCol] = useState<string | null>(null);
  const [repMap, setRepMap] = useState<Record<string, string>>({});
  const [presence, setPresence] = useState<Map<string, Presence[]> | null>(null);
  const [showTaken, setShowTaken] = useState(false);
  const [allColumns, setAllColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const nameOf = (id: string) => (id === meId ? "You" : team.find((m) => m.id === id)?.full_name ?? "a teammate");

  function autoMap(rows: Record<string, unknown>[], col: string | null) {
    const m: Record<string, string> = {};
    if (!col) return m;
    for (const r of rows) {
      const name = cell(r[col]);
      if (name && !(repKey(name) in m)) m[repKey(name)] = matchMember(name, team) ?? "";
    }
    return m;
  }

  /** Look up, across the whole team, who already has the clients in this sheet. */
  async function loadPresence(rows: Record<string, unknown>[], companyCol: string | null) {
    setPresence(null);
    if (!companyCol) return;
    const keys = [...new Set(rows.map((r) => cell(r[companyCol])).filter(Boolean).map(normalizeCompany))];
    try {
      // Asked straight from the browser with the signed-in session (no server round trip).
      const supabase = createClient();
      const found: Presence[] = [];
      for (let i = 0; i < keys.length; i += 500) {
        const { data, error } = await supabase.rpc("client_presence", { p_keys: keys.slice(i, i + 500) });
        if (error) throw new Error(error.message);
        found.push(...((data ?? []) as Presence[]));
      }
      const m = new Map<string, Presence[]>();
      for (const p of found) m.set(p.company_key, [...(m.get(p.company_key) ?? []), p]);
      setPresence(m);
    } catch (e) {
      setError(`Couldn't check for duplicates (${e instanceof Error ? e.message : "unknown error"}). Reload the page and try again.`);
    }
  }

  async function onFile(file: File) {
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null, raw: true });
      if (rows.length === 0) throw new Error("That sheet looks empty.");
      const headers = Object.keys(rows[0]).filter((h) => !h.startsWith("__EMPTY"));
      const m = guessMapping(headers);
      const rc = findRepColumn(headers.filter((h) => h !== m.company));
      setSheet({ name: file.name, headers, rows });
      setMapping(m);
      setRepCol(rc);
      setRepMap(autoMap(rows, rc));
      await loadPresence(rows, m.company);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file. Upload an .xlsx or .csv.");
    }
  }

  const entries = useMemo<Entry[]>(() => {
    if (!sheet || !mapping) return [];
    return sheet.rows
      .map((raw) => {
        const row: ImportRow = {};
        for (const f of IMPORT_FIELDS) {
          const col = mapping[f.key];
          if (!col) continue;
          const v = raw[col];
          row[f.key] = f.kind === "date" ? parseDate(v) : f.kind === "number" ? parseNumber(v) : v == null ? null : String(v).trim();
        }
        return { row, rep: repCol ? repKey(cell(raw[repCol])) : "" };
      })
      .filter((e) => e.row.company);
  }, [sheet, mapping, repCol]);

  // Who each row goes to, and what gets skipped.
  // Clients already in my CRM are updated. Every new client becomes an approval request
  // for its salesperson (me included). Anything already with someone else is skipped.
  const plan = useMemo(() => {
    const updates: ImportRow[] = [];
    const requests = new Map<string, ImportRow[]>();
    const taken: { company: string; with: string }[] = [];
    let alreadyTheirs = 0, repeated = 0, noRep = 0, unmatched = 0;
    const seen = new Set<string>();
    for (const { row, rep } of entries) {
      const key = normalizeCompany(String(row.company));
      if (seen.has(key)) { repeated++; continue; }
      seen.add(key);
      let target = meId;
      if (repCol) {
        if (!rep) { noRep++; continue; }
        target = repMap[rep];
        if (!target) { unmatched++; continue; }
      }
      const found = presence?.get(key) ?? [];
      const other = found.find((p) => p.owner_id !== target);
      if (other) { taken.push({ company: String(row.company), with: other.kind === "request" ? `awaiting ${other.owner_name}'s approval` : `with ${other.owner_name}` }); continue; }
      if (target === meId && found.some((p) => p.kind === "client")) { updates.push(row); continue; }
      if (found.length) { alreadyTheirs++; continue; } // already theirs, or already awaiting their approval
      requests.set(target, [...(requests.get(target) ?? []), row]);
    }
    // My own requests first.
    const ordered = new Map([...requests].sort(([a], [b]) => (a === meId ? -1 : b === meId ? 1 : 0)));
    return { updates, requests: ordered, taken, alreadyTheirs, repeated, noRep, unmatched };
  }, [entries, repCol, repMap, presence, meId]);

  const requestCount = [...plan.requests.values()].reduce((s, l) => s + l.length, 0);
  const total = plan.updates.length + requestCount;

  async function run() {
    setError(null);
    let updated = 0, skipped = 0;
    for (let i = 0; i < plan.updates.length; i += CHUNK) {
      setProgress(`Updating your clients ${Math.min(i + CHUNK, plan.updates.length)}/${plan.updates.length}…`);
      const res = await importClients(plan.updates.slice(i, i + CHUNK), true);
      if (res.error) { setError(res.error); setProgress(null); return; }
      updated += res.updated ?? 0;
    }
    const sent: Result["requests"] = [];
    if (requestCount) {
      const batch = crypto.randomUUID();
      for (const [assignee, list] of plan.requests) {
        let n = 0;
        for (let i = 0; i < list.length; i += CHUNK) {
          setProgress(`Sending ${assignee === meId ? "your clients" : `clients to ${nameOf(assignee)}`} for approval…`);
          const res = await createAssignments(batch, list.slice(i, i + CHUNK).map((r) => ({
            assigneeId: assignee, company: String(r.company), area: r.area as string | null, contactPerson: r.contact_person as string | null, phone: r.phone as string | null, notes: r.notes as string | null,
            details: { email: r.email, address: r.address, industry: r.industry, total_shipments: r.total_shipments, first_shipment_date: r.first_shipment_date, last_shipment_date: r.last_shipment_date, last_meeting_date: r.last_meeting_date, last_contact_date: r.last_contact_date, next_follow_up: r.next_follow_up },
          })));
          if (res.error) { setError(res.error); setProgress(null); return; }
          n += res.created ?? 0;
          skipped += res.skipped ?? 0;
        }
        if (n) sent.push({ name: assignee === meId ? "you" : nameOf(assignee), count: n, mine: assignee === meId });
      }
      setProgress("Notifying your teammates…");
      await notifyBatch(batch);
    }
    if (plan.updates.length) await finishImport();
    setResult({ updated, requests: sent, skipped });
    setProgress(null);
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      [...IMPORT_FIELDS.map((f) => f.label), "Salesperson"],
      ["Shree Ganesh Exports", "Ramesh Patel", "9820012345", "ramesh@example.com", "Andheri", "Unit 4, MIDC, Andheri East", "Textiles", 42, "15/06/2019", "02/10/2026", "12/09/2026", "20/10/2026", "", "Prefers morning calls", ""],
      ["Kiran Pharma Pvt Ltd", "Sneha Iyer", "9833098765", "", "Powai", "", "Pharma", 8, "01/03/2023", "18/04/2026", "05/01/2026", "", "", "", ""],
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
          <p className="text-lg font-bold">Upload done</p>
          <ul className="mt-1 space-y-0.5 text-sm text-muted">
            {result.requests.map((r) => <li key={r.name}>{r.count} new client{r.count === 1 ? "" : "s"} waiting for {r.mine ? "your" : `${r.name}'s`} approval</li>)}
            {result.updated > 0 && <li>{result.updated} already in your CRM: updated with newer details</li>}
            {result.skipped > 0 && <li>{result.skipped} skipped: already with a teammate</li>}
            {!result.requests.length && !result.updated && <li>Nothing new: everything was already in the CRM.</li>}
          </ul>
        </div>
        <p className="text-sm text-muted">New clients join the CRM once they&apos;re approved and given a priority.</p>
        {result.requests.some((r) => r.mine)
          ? <button className="btn-primary w-full" onClick={() => { router.push("/assignments"); router.refresh(); }}>Approve my new clients</button>
          : <button className="btn-primary w-full" onClick={() => { router.push(doneHref); router.refresh(); }}>{firstTime ? "Build my day" : "Done"}</button>}
      </div>
    );
  }

  if (!sheet || !mapping) {
    return (
      <div className="space-y-4">
        <label className="card flex cursor-pointer flex-col items-center gap-3 border-dashed px-5 py-10 text-center">
          <Upload className="text-brand" />
          <span className="font-semibold">Choose a client list</span>
          <span className="text-sm text-muted">Excel or CSV. If it has a salesperson column (e.g. &quot;Sales Team&quot;), teammates&apos; clients are sent to them for approval.</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={downloadTemplate} className="btn-secondary w-full"><Download size={16} /> Download the template</button>
        {firstTime && <button onClick={skip} className="btn-ghost w-full">I&apos;ll add clients manually</button>}
      </div>
    );
  }

  const repNames = Object.keys(repMap).sort();
  // How each name is written in the sheet (first spelling seen), for display.
  const repLabel: Record<string, string> = {};
  if (repCol) for (const r of sheet.rows) { const n = cell(r[repCol]); if (n && !repLabel[repKey(n)]) repLabel[repKey(n)] = n; }
  const skippedTotal = plan.taken.length + plan.alreadyTheirs + plan.repeated + plan.noRep + plan.unmatched;

  return (
    <div className="space-y-5">
      <div className="card flex items-center gap-3 p-4">
        <FileSpreadsheet className="shrink-0 text-green-700" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{sheet.name}</p>
          <p className="text-sm text-muted">{sheet.rows.length} rows · {entries.length} with a client name</p>
        </div>
        <button className="btn-ghost px-2" onClick={() => { setSheet(null); setMapping(null); setPresence(null); }}>Change</button>
      </div>

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold">Columns</h2>
        <div className="card divide-y divide-line">
          {[...IMPORT_FIELDS.map((f) => ({ key: f.key as string, label: f.label, required: "required" in f && f.required })), { key: "__rep", label: "Salesperson", required: false }]
            // Only columns found in the sheet are shown, unless all are asked for.
            .filter((f) => allColumns || f.required || f.key === "__rep" || mapping[f.key as ImportFieldKey])
            .map((f) => (
            <div key={f.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-32 shrink-0 text-sm font-medium">{f.label}{f.required && <span className="text-red-600"> *</span>}</span>
              <select
                className="input min-h-10 text-sm"
                value={(f.key === "__rep" ? repCol : mapping[f.key as ImportFieldKey]) ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  if (f.key === "__rep") { setRepCol(v); setRepMap(autoMap(sheet.rows, v)); return; }
                  setMapping({ ...mapping, [f.key]: v });
                  if (f.key === "company") loadPresence(sheet.rows, v);
                }}
              >
                <option value="">{f.key === "__rep" ? "None: all clients are mine" : "Not in my sheet"}</option>
                {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button className="mt-2 px-1 text-xs font-semibold text-brand" onClick={() => setAllColumns((v) => !v)}>
          {allColumns ? "Show only matched columns" : "A column wasn't picked up? Show all fields"}
        </button>
      </section>

      {repCol && repNames.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-sm font-bold">Salespeople</h2>
            {plan.unmatched > 0 && <span className="text-xs font-semibold text-red-700">Some names need matching</span>}
          </div>
          <div className="card divide-y divide-line">
            {repNames.map((name) => (
              <div key={name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-32 shrink-0 truncate text-sm font-medium" title={repLabel[name]}>{repLabel[name] ?? name}</span>
                <select className={`input min-h-10 text-sm ${repMap[name] ? "" : "border-red-300"}`} value={repMap[name]} onChange={(e) => setRepMap({ ...repMap, [name]: e.target.value })}>
                  <option value="">Skip these clients</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.id === meId ? `${m.full_name} (me)` : m.full_name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="mt-2 px-1 text-xs text-muted">If someone isn&apos;t listed, their account needs creating first, with their full name.</p>
        </section>
      )}

      {mapping.company && (
        <section className="card divide-y divide-line text-sm">
          {presence === null ? (
            <p className="p-4 text-muted">Checking the whole team for duplicates…</p>
          ) : (
            <>
              {[...plan.requests].map(([id, list]) => (
                <div key={id} className="flex justify-between gap-3 px-4 py-3">
                  <span className="truncate">{id === meId ? "New for you to approve" : `New for ${nameOf(id)} to approve`}</span>
                  <span className="font-semibold tabular-nums">{list.length}</span>
                </div>
              ))}
              {plan.updates.length > 0 && (
                <div className="flex justify-between gap-3 px-4 py-3">
                  <span>Already in your CRM (updated)</span>
                  <span className="font-semibold tabular-nums">{plan.updates.length}</span>
                </div>
              )}
              {skippedTotal > 0 && (
                <div className="space-y-1 px-4 py-3 text-xs text-muted">
                  <p className="text-sm font-medium text-ink">Skipped · {skippedTotal}</p>
                  {plan.taken.length > 0 && (
                    <p>
                      {plan.taken.length} already with a teammate.{" "}
                      <button className="font-semibold text-brand" onClick={() => setShowTaken((v) => !v)}>{showTaken ? "Hide" : "Show"}</button>
                    </p>
                  )}
                  {showTaken && (
                    <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                      {plan.taken.slice(0, 200).map((t, i) => <li key={i}><span className="text-ink">{t.company}</span> · {t.with}</li>)}
                    </ul>
                  )}
                  {plan.alreadyTheirs > 0 && <p>{plan.alreadyTheirs} already with that salesperson or awaiting their approval</p>}
                  {plan.repeated > 0 && <p>{plan.repeated} repeated rows in the file</p>}
                  {plan.noRep > 0 && <p>{plan.noRep} with no salesperson</p>}
                  {plan.unmatched > 0 && <p>{plan.unmatched} for salesperson names not matched</p>}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={!mapping.company || !presence || total === 0 || !!progress} onClick={run}>
        {progress ?? (total === 0 ? "Nothing new to add" : [requestCount && `Send ${requestCount} for approval`, plan.updates.length && `update ${plan.updates.length}`].filter(Boolean).join(" · ").replace(/^u/, "U"))}
      </button>
    </div>
  );
}
