// Master list columns. `aliases` drive automatic column matching on upload,
// so a sheet with slightly different headers still maps without manual work.
export const IMPORT_FIELDS = [
  { key: "company", label: "Company name", required: true, kind: "text", aliases: ["company", "company name", "client", "client name", "customer", "customer name", "firm", "party", "party name", "account"] },
  { key: "contact_person", label: "Contact person", kind: "text", aliases: ["contact", "contact person", "contact name", "person", "name", "poc", "spoc"] },
  { key: "phone", label: "Phone", kind: "text", aliases: ["phone", "mobile", "phone number", "mobile number", "contact number", "mobile no", "phone no", "whatsapp", "cell"] },
  { key: "email", label: "Email", kind: "text", aliases: ["email", "email id", "e-mail", "mail"] },
  { key: "area", label: "Area", kind: "text", aliases: ["area", "location", "locality", "region", "zone", "city", "suburb"] },
  { key: "address", label: "Address", kind: "text", aliases: ["address", "office address", "full address"] },
  { key: "industry", label: "Industry", kind: "text", aliases: ["industry", "sector", "segment", "business type", "category"] },
  { key: "total_shipments", label: "Total shipments", kind: "number", aliases: ["total shipments", "shipments", "no of shipments", "number of shipments", "shipment count", "jobs", "total jobs", "orders", "total orders"] },
  { key: "first_shipment_date", label: "First shipment date", kind: "date", aliases: ["first shipment", "first shipment date", "client since", "customer since", "start date"] },
  { key: "last_shipment_date", label: "Last shipment date", kind: "date", aliases: ["last shipment", "last shipment date", "latest shipment", "last order", "last order date", "last job date"] },
  { key: "last_meeting_date", label: "Last meeting date", kind: "date", aliases: ["last meeting", "last meeting date", "last met", "last visit", "last visit date", "met on"] },
  { key: "last_contact_date", label: "Last contact date", kind: "date", aliases: ["last contact", "last contact date", "last contacted", "last call", "last spoken"] },
  { key: "next_follow_up", label: "Next follow-up", kind: "date", aliases: ["next follow up", "next follow-up", "follow up", "follow-up date", "followup", "next action date"] },
  { key: "notes", label: "Notes", kind: "text", aliases: ["notes", "remarks", "comments", "remark", "comment"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type ImportRow = Partial<Record<ImportFieldKey, string | number | null>>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Best-guess mapping from sheet headers to fields. */
export function guessMapping(headers: string[]): Record<ImportFieldKey, string | null> {
  const used = new Set<string>();
  const out = {} as Record<ImportFieldKey, string | null>;
  for (const f of IMPORT_FIELDS) {
    const aliases = f.aliases.map(norm);
    const exact = headers.find((h) => !used.has(h) && aliases.includes(norm(h)));
    const partial = exact ?? headers.find((h) => !used.has(h) && aliases.some((a) => a.length > 3 && norm(h).includes(a)));
    out[f.key] = partial ?? null;
    if (partial) used.add(partial);
  }
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Parses the date formats Indian sales sheets actually contain.
 * Ambiguous numeric dates are read day-first (dd/mm/yyyy).
 */
export function parseDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number") {
    // Excel serial date
    if (value < 1 || value > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return iso(fullYear(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s,-]+(\d{2,4})$/i);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(fullYear(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*[\s-]+(\d{1,2}),?[\s-]+(\d{2,4})$/i);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(fullYear(+m[3]), MONTHS[m[1].toLowerCase()], +m[2]);
  return null;
}

export function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return isFinite(value) ? Math.max(0, Math.round(value)) : null;
  const n = Number(String(value).replace(/[,\s]/g, ""));
  return isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function fullYear(y: number) {
  return y < 100 ? 2000 + y : y;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}
