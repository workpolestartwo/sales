"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";
import { todayIST } from "@/lib/dates";
import { date, int, str, uuid, type ActionResult } from "@/lib/validate";
import { normalizeCompany } from "@/lib/company-key";
import type { Presence, TeamMember } from "@/lib/team-match";

// Note: a "use server" file must export only async functions (no type re-exports),
// or the dev server can mis-register them. Import TeamMember from "@/lib/team-match".

/** Who already has these clients, across the whole team (for the upload preview). */
export async function getPresence(keys: string[]): Promise<Presence[]> {
  const { supabase } = await requireUser();
  const clean = [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === "string" && k.length <= 200))].slice(0, 20000);
  if (!clean.length) return [];
  const out: Presence[] = [];
  for (let i = 0; i < clean.length; i += 1000) {
    const { data } = await supabase.rpc("client_presence", { p_keys: clean.slice(i, i + 1000) });
    out.push(...((data ?? []) as Presence[]));
  }
  return out;
}

export async function getTeam(): Promise<TeamMember[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("team_members");
  return (data ?? []) as TeamMember[];
}

interface AssignRow {
  assigneeId: string; company: string; area?: string | null; contactPerson?: string | null; phone?: string | null; notes?: string | null;
  /** Other sheet columns, kept until the client is approved. */
  details?: Record<string, unknown> | null;
}

/** Only known columns, cleaned the same way as a normal import. */
function cleanDetails(d: Record<string, unknown> | null | undefined) {
  if (!d || typeof d !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const k of ["email", "address", "industry"] as const) { const v = str(d[k], k === "address" ? 500 : 200); if (v) out[k] = v; }
  const n = int(d.total_shipments); if (n) out.total_shipments = n;
  for (const k of ["first_shipment_date", "last_shipment_date", "last_meeting_date", "last_contact_date", "next_follow_up"] as const) { const v = date(d[k]); if (v) out[k] = v; }
  return out;
}

/**
 * Sends one chunk of an upload as approval requests. A client that's already in anyone's
 * list, or already waiting for someone's approval, is skipped (never sent twice).
 */
export async function createAssignments(batchId: string, rows: AssignRow[]): Promise<ActionResult & { created?: number; skipped?: number }> {
  const { supabase, user } = await requireUser();
  const batch = uuid(batchId);
  if (!batch || !Array.isArray(rows) || rows.length > 1000) return { error: "Invalid upload." };

  const team = new Set(((await supabase.rpc("team_members")).data ?? []).map((m: TeamMember) => m.id));
  const clean = rows
    .map((r) => ({
      batch_id: batch,
      assignee_id: uuid(r.assigneeId),
      assigned_by: user.id,
      company: str(r.company, 200),
      area: str(r.area, 100),
      contact_person: str(r.contactPerson, 120),
      phone: str(r.phone, 40),
      notes: str(r.notes, 2000),
      details: cleanDetails(r.details),
    }))
    .filter((r) => r.assignee_id && team.has(r.assignee_id) && r.company);

  const keys = clean.map((r) => normalizeCompany(r.company));
  const { data: present } = await supabase.rpc("client_presence", { p_keys: [...new Set(keys)] });
  const taken = new Set(((present ?? []) as Presence[]).map((p) => p.company_key));
  const seen = new Set<string>();
  const fresh = clean.filter((_, i) => {
    const k = keys[i];
    if (taken.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!fresh.length) return { created: 0, skipped: clean.length };

  const { error } = await supabase.from("client_assignments").insert(fresh);
  if (error) return { error: error.message };
  return { created: fresh.length, skipped: clean.length - fresh.length };
}

/** After an upload: tells each salesperson (push notification) how many clients were put under their name. */
export async function notifyBatch(batchId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const batch = uuid(batchId);
  if (!batch) return { error: "Invalid upload." };
  const { data: rows } = await supabase.from("client_assignments").select("assignee_id, assigned_by_name").eq("batch_id", batch).eq("assigned_by", user.id);
  if (!rows?.length) return { ok: true };

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.assignee_id, (counts.get(r.assignee_id) ?? 0) + 1);
  const from = rows[0].assigned_by_name ?? "A teammate";

  try {
    // Other people's phone subscriptions are only readable server-side.
    const admin = createAdminClient();
    const { data: subs } = await admin.from("push_subscriptions").select("id, owner_id, endpoint, p256dh, auth").in("owner_id", [...counts.keys()]);
    await Promise.all([...counts].map(([assignee, n]) => {
      const mine = (subs ?? []).filter((s) => s.owner_id === assignee);
      if (!mine.length || assignee === user.id) return 0;
      return sendPush(admin, mine, {
        title: "New clients for you",
        body: `${from} added ${n} client${n === 1 ? "" : "s"} under your name. Tap to review.`,
        url: "/assignments",
        tag: `assign-${batch}`,
      });
    }));
  } catch {
    // Notifications are best-effort; the request still shows in the app.
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function acceptAssignments(ids: string[]): Promise<ActionResult & { added?: number }> {
  const { supabase } = await requireUser();
  const clean = (Array.isArray(ids) ? ids : []).map(uuid).filter(Boolean);
  if (!clean.length) return { error: "Pick at least one client." };
  const { data, error } = await supabase.rpc("accept_assignments", { p_ids: clean });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, added: data as number };
}

export async function reassignAssignments(ids: string[], toId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const clean = (Array.isArray(ids) ? ids : []).map(uuid).filter(Boolean);
  const to = uuid(toId);
  if (!clean.length || !to) return { error: "Pick the clients and who to pass them to." };
  const { data: batch, error } = await supabase.rpc("reassign_assignments", { p_ids: clean, p_to: to });
  if (error) return { error: error.message.includes("teammate") ? "Pick a teammate other than yourself." : error.message };
  await notifyBatch(batch as string);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function dropAssignments(ids: string[]): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const clean = (Array.isArray(ids) ? ids : []).map(uuid).filter(Boolean) as string[];
  if (!clean.length) return { error: "Pick at least one client." };
  const { error } = await supabase
    .from("client_assignments")
    .update({ status: "dropped", decided_at: new Date().toISOString() })
    .in("id", clean)
    .eq("assignee_id", user.id)
    .eq("status", "pending");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

const TIERS = ["A", "B", "C"] as const;

/** The salesperson's priority always wins. Setting it starts the client's contact cycle. */
export async function setPriority(clientIds: string[], tier: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const clean = (Array.isArray(clientIds) ? clientIds : []).map(uuid).filter(Boolean) as string[];
  if (!clean.length || !(TIERS as readonly string[]).includes(tier)) return { error: "Pick a priority." };
  const { error } = await supabase.from("clients").update({ manual_tier: tier, priority_pending: false, updated_at: new Date().toISOString() }).in("id", clean);
  if (error) return { error: error.message };
  await supabase.rpc("refresh_client_scores", { p_today: todayIST() });
  revalidatePath("/", "layout");
  return { ok: true };
}
