"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { addDays, todayIST } from "@/lib/dates";
import { ensureTodayPlan, matchPlanItem } from "@/lib/plan-server";
import { normalizeCompany } from "@/lib/company-key";
import { activityType, date, outcome, str, uuid, type ActionResult } from "@/lib/validate";

interface NewClientInput {
  company: string;
  contactPerson?: string;
  phone?: string;
  area?: string;
  notes?: string;
}

interface LogInput {
  clientId?: string | null;
  newClient?: NewClientInput | null;
  type: string;
  outcome: string;
  notes?: string;
  followUpDate?: string | null;
  isCold?: boolean;
  planItemId?: string | null;
  /** Day it happened (set on the phone). Lets offline logs sync later with the right date. */
  activityDate?: string | null;
  /** Unique per log made on the phone; a retried log with the same ref is saved only once. */
  clientRef?: string | null;
}

function ref(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
}

/** Accept the phone's date for up to 7 days back (offline sync); otherwise today. */
function activityDay(input: unknown, today: string): string {
  const d = date(input);
  return d && d <= today && d >= addDays(today, -7) ? d : today;
}

/** Today's plan (created if needed), or the existing plan for a past day (never created). */
async function planFor(supabase: SupabaseClient, userId: string, day: string, today: string): Promise<string | null> {
  if (day === today) return ensureTodayPlan(supabase, userId, today);
  const { data } = await supabase.from("day_plans").select("id").eq("plan_date", day).maybeSingle();
  return data?.id ?? null;
}

/** Logs a single call, text or meeting. A cold call to a new number creates a prospect. */
export async function logActivity(input: LogInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const today = todayIST();
  const type = activityType(input.type);
  const result = outcome(input.outcome);
  if (!type || !result) return { error: "Pick what you did and how it went." };
  const clientRef = ref(input.clientRef);
  if (clientRef) {
    const { data: done } = await supabase.from("activities").select("id").eq("client_ref", clientRef).maybeSingle();
    if (done) return { ok: true };
  }

  let clientId = uuid(input.clientId);
  if (!clientId && input.newClient) {
    const created = await createProspect(supabase, user.id, input.newClient, null);
    if ("error" in created) return created;
    clientId = created.id;
  }
  if (!clientId) return { error: "Pick a client." };

  const day = activityDay(input.activityDate, today);
  const planId = await planFor(supabase, user.id, day, today);
  const planItemId = planId ? await matchPlanItem(supabase, planId, clientId, uuid(input.planItemId)) : null;

  const { error } = await supabase.from("activities").insert({
    owner_id: user.id,
    client_id: clientId,
    type,
    activity_date: day,
    outcome: result,
    notes: str(input.notes, 2000),
    follow_up_date: date(input.followUpDate),
    is_cold: Boolean(input.isCold),
    plan_item_id: planItemId,
    client_ref: clientRef,
  });
  if (error) return error.code === "23505" ? { ok: true } : { error: error.message };

  await supabase.rpc("refresh_client_scores", { p_today: today });
  revalidatePath("/", "layout");
  return { ok: true, id: clientId };
}

interface FieldVisitInput {
  area: string;
  notes?: string;
  met: { clientId: string; outcome: string; notes?: string; followUpDate?: string | null }[];
  newOffices: (NewClientInput & { outcome?: string; followUpDate?: string | null })[];
  activityDate?: string | null;
  clientRef?: string | null;
}

/**
 * Logs a field visit: the area, existing clients met, and new offices approached.
 * New offices are added to the member's client list as prospects.
 */
export async function logFieldVisit(input: FieldVisitInput): Promise<ActionResult & { added?: number }> {
  const { supabase, user } = await requireUser();
  const today = todayIST();
  const area = str(input.area, 100);
  if (!area) return { error: "Which area did you visit?" };
  const met = Array.isArray(input.met) ? input.met.slice(0, 100) : [];
  const offices = Array.isArray(input.newOffices) ? input.newOffices.filter((o) => str(o.company)).slice(0, 100) : [];
  if (met.length === 0 && offices.length === 0) {
    return { error: "Add at least one client you met or office you approached." };
  }

  const clientRef = ref(input.clientRef);
  if (clientRef) {
    const { data: done } = await supabase.from("field_visits").select("id").eq("client_ref", clientRef).maybeSingle();
    if (done) return { ok: true };
  }

  const day = activityDay(input.activityDate, today);
  const { data: visit, error: vErr } = await supabase
    .from("field_visits")
    .insert({ owner_id: user.id, visit_date: day, area, notes: str(input.notes, 2000), client_ref: clientRef })
    .select("id")
    .single();
  if (vErr) return vErr.code === "23505" ? { ok: true } : { error: vErr.message };

  const planId = await planFor(supabase, user.id, day, today);
  const rows = [];

  for (const m of met) {
    const clientId = uuid(m.clientId);
    if (!clientId) continue;
    rows.push({
      owner_id: user.id,
      client_id: clientId,
      type: "visit",
      activity_date: day,
      outcome: outcome(m.outcome) ?? "met",
      notes: str(m.notes, 2000),
      follow_up_date: date(m.followUpDate),
      is_cold: false,
      field_visit_id: visit.id,
      plan_item_id: planId ? await matchPlanItem(supabase, planId, clientId, null) : null,
    });
  }

  let added = 0;
  for (const o of offices) {
    const created = await createProspect(supabase, user.id, { ...o, area: o.area || area }, "field");
    if ("error" in created) return created;
    if (!created.existed) added++;
    rows.push({
      owner_id: user.id,
      client_id: created.id,
      type: "visit",
      activity_date: day,
      outcome: outcome(o.outcome) ?? "new_lead",
      notes: str(o.notes, 2000),
      follow_up_date: date(o.followUpDate),
      is_cold: true,
      field_visit_id: visit.id,
      plan_item_id: null,
    });
  }

  if (rows.length) {
    const { error } = await supabase.from("activities").insert(rows);
    if (error) return { error: error.message };
  }

  await supabase.rpc("refresh_client_scores", { p_today: today });
  revalidatePath("/", "layout");
  return { ok: true, added };
}

async function createProspect(
  supabase: SupabaseClient,
  userId: string,
  c: NewClientInput,
  source: "field" | null,
): Promise<{ id: string; existed?: boolean } | { error: string }> {
  const company = str(c.company, 200);
  if (!company) return { error: "New client needs a company name." };

  // Already in the list (even if written differently)? Log against that client instead of duplicating.
  const { data: existing } = await supabase.from("clients").select("id, phone, contact_person, area").eq("company_key", normalizeCompany(company)).maybeSingle();
  if (existing) {
    const fill: Record<string, string> = {};
    if (!existing.phone && str(c.phone, 40)) fill.phone = str(c.phone, 40)!;
    if (!existing.contact_person && str(c.contactPerson, 120)) fill.contact_person = str(c.contactPerson, 120)!;
    if (!existing.area && str(c.area, 100)) fill.area = str(c.area, 100)!;
    if (Object.keys(fill).length) await supabase.from("clients").update(fill).eq("id", existing.id);
    return { id: existing.id, existed: true };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      owner_id: userId,
      company,
      contact_person: str(c.contactPerson, 120),
      phone: str(c.phone, 40),
      area: str(c.area, 100),
      notes: str(c.notes, 2000),
      source: source ?? "manual",
      status: "prospect",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}
