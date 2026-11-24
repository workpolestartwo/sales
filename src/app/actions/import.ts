"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayIST } from "@/lib/dates";
import { normalizeCompany } from "@/lib/company-key";
import { date, int, str, type ActionResult } from "@/lib/validate";
import type { ImportRow } from "@/lib/import-fields";
import type { Presence } from "@/lib/team-match";

const MAX_ROWS_PER_CALL = 1000;

type Clean = {
  company: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  address: string | null;
  industry: string | null;
  total_shipments: number;
  first_shipment_date: string | null;
  last_shipment_date: string | null;
  last_meeting_date: string | null;
  last_contact_date: string | null;
  next_follow_up: string | null;
  notes: string | null;
};

const TEXT_FIELDS = ["contact_person", "phone", "email", "area", "address", "industry", "notes"] as const;

/** Company keys already in the member's list, for the import preview. */
export async function getCompanyKeys(): Promise<{ keys: string[]; error?: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("clients").select("company_key").limit(20000);
  if (error) return { keys: [], error: `Couldn't check your existing clients (${error.message}).` };
  return { keys: (data ?? []).map((r) => r.company_key as string) };
}

/**
 * Imports one chunk of master-list rows without ever creating a duplicate.
 * - Rows for the same company within the chunk are merged into one.
 * - Companies already in the list are updated: blanks filled in, the newest
 *   dates and the higher shipment count kept. Nothing already there is erased.
 * - Everything else is inserted as a new client.
 */
export async function importClients(
  rows: ImportRow[],
  /** Uploads only update clients already in the CRM; new ones go through approval. */
  updateOnly = false,
): Promise<ActionResult & { inserted?: number; updated?: number; merged?: number; skipped?: number; taken?: number }> {
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0, updated: 0, merged: 0, skipped: 0 };
  if (rows.length > MAX_ROWS_PER_CALL) return { error: "Too many rows in one batch." };
  const { supabase, user } = await requireUser();

  // 1. Clean + merge repeats within this batch.
  let skipped = 0, merged = 0;
  const byKey = new Map<string, Clean>();
  const explicitZero = new Set<string>();
  for (const r of rows) {
    const c = clean(r);
    if (!c) { skipped++; continue; }
    const key = normalizeCompany(c.company);
    if (r.total_shipments === 0) explicitZero.add(key);
    const prev = byKey.get(key);
    if (prev) { byKey.set(key, mergeInto(prev, c)); merged++; }
    else byKey.set(key, c);
  }

  // 2. Skip clients that already belong to a teammate (or await a teammate's approval).
  let taken = 0;
  const { data: present } = await supabase.rpc("client_presence", { p_keys: [...byKey.keys()] });
  for (const p of (present ?? []) as Presence[]) {
    if (p.owner_id !== user.id && byKey.delete(p.company_key)) taken++;
  }

  // 3. Which are already in my list?
  const keys = [...byKey.keys()];
  const existing = new Map<string, Clean & { id: string; status: string }>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, status, company_key, company, contact_person, phone, email, area, address, industry, total_shipments, first_shipment_date, last_shipment_date, last_meeting_date, last_contact_date, next_follow_up, notes")
      .in("company_key", keys.slice(i, i + 200));
    if (error) return { error: error.message };
    for (const row of data ?? []) existing.set(row.company_key as string, row as Clean & { id: string; status: string });
  }

  // 3. Update existing clients where the upload adds something.
  let updated = 0;
  const updates: PromiseLike<unknown>[] = [];
  for (const [key, incoming] of byKey) {
    const cur = existing.get(key);
    if (!cur) continue;
    const next = mergeInto(cur, incoming);
    const patch: Record<string, unknown> = {};
    for (const f of [...TEXT_FIELDS, "total_shipments", "first_shipment_date", "last_shipment_date", "last_meeting_date", "last_contact_date", "next_follow_up"] as const) {
      if (next[f] !== cur[f]) patch[f] = next[f];
    }
    // A prospect who now has shipments has become a client.
    if (cur.status === "prospect" && next.total_shipments > 0) patch.status = "active";
    if (Object.keys(patch).length === 0) continue;
    updated++;
    updates.push(supabase.from("clients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", cur.id));
  }
  await Promise.all(updates);

  // 4. Insert the new ones. The unique index is the final guard; conflicts are ignored.
  // With no shipment data there's nothing to rank on, so the salesperson picks each
  // client's priority (Set priority list). A sheet that says 0 shipments means a prospect.
  const fresh = [...byKey].filter(([key]) => !existing.has(key)).map(([key, c]) => ({
    ...c,
    owner_id: user.id,
    source: "master_list" as const,
    status: explicitZero.has(key) ? ("prospect" as const) : ("active" as const),
    priority_pending: c.total_shipments === 0 && !c.last_shipment_date,
  }));
  let inserted = 0;
  if (fresh.length && !updateOnly) {
    const { data, error } = await supabase
      .from("clients")
      .upsert(fresh, { onConflict: "owner_id,company_key", ignoreDuplicates: true })
      .select("id");
    if (error) return { error: error.message };
    inserted = data?.length ?? 0;
  }

  return { inserted, updated, merged, skipped, taken };
}

/** Scores every client and marks the member as onboarded. */
export async function finishImport(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc("refresh_client_scores", { p_today: todayIST() });
  if (error) return { error: error.message };
  await supabase.from("profiles").update({ onboarded: true }).eq("id", user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function skipOnboarding(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  await supabase.from("profiles").update({ onboarded: true }).eq("id", user.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

function clean(r: ImportRow): Clean | null {
  const company = str(r.company, 200);
  if (!company) return null;
  return {
    company,
    contact_person: str(r.contact_person, 120),
    phone: str(r.phone, 40),
    email: str(r.email, 200),
    area: str(r.area, 100),
    address: str(r.address, 500),
    industry: str(r.industry, 100),
    total_shipments: int(r.total_shipments) ?? 0,
    first_shipment_date: date(r.first_shipment_date),
    last_shipment_date: date(r.last_shipment_date),
    last_meeting_date: date(r.last_meeting_date),
    last_contact_date: date(r.last_contact_date),
    next_follow_up: date(r.next_follow_up),
    notes: str(r.notes, 2000),
  };
}

/** Combine two records of the same client without losing information. */
function mergeInto<T extends Clean>(base: T, extra: Clean): T {
  const out = { ...base };
  for (const f of TEXT_FIELDS) if (!out[f] && extra[f]) out[f] = extra[f];
  out.total_shipments = Math.max(base.total_shipments ?? 0, extra.total_shipments ?? 0);
  out.first_shipment_date = minDate(base.first_shipment_date, extra.first_shipment_date);
  out.last_shipment_date = maxDate(base.last_shipment_date, extra.last_shipment_date);
  out.last_meeting_date = maxDate(base.last_meeting_date, extra.last_meeting_date);
  out.last_contact_date = maxDate(base.last_contact_date, extra.last_contact_date);
  out.next_follow_up = base.next_follow_up ?? extra.next_follow_up;
  return out;
}

const maxDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const minDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
