"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayIST } from "@/lib/dates";
import { normalizeCompany } from "@/lib/company-key";
import { date, int, str, uuid, type ActionResult } from "@/lib/validate";

const STATUSES = ["active", "prospect", "dormant", "lost"] as const;

function fields(form: FormData) {
  const status = String(form.get("status") ?? "");
  return {
    company: str(form.get("company"), 200),
    contact_person: str(form.get("contact_person"), 120),
    phone: str(form.get("phone"), 40),
    email: str(form.get("email"), 200),
    area: str(form.get("area"), 100),
    address: str(form.get("address"), 500),
    industry: str(form.get("industry"), 100),
    total_shipments: int(form.get("total_shipments") || 0) ?? 0,
    last_shipment_date: date(form.get("last_shipment_date")),
    next_follow_up: date(form.get("next_follow_up")),
    notes: str(form.get("notes"), 2000),
    status: (STATUSES as readonly string[]).includes(status) ? status : "prospect",
  };
}

export async function saveClient(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const data = fields(form);
  if (!data.company) return { error: "Company name is required." };
  const id = uuid(form.get("id"));

  // Never create a second copy of a client, even if the name is written differently.
  const { data: dup } = await supabase
    .from("clients")
    .select("id, company")
    .eq("company_key", normalizeCompany(data.company))
    .maybeSingle();
  if (dup && dup.id !== id) return { error: `"${dup.company}" is already in your client list.`, id: dup.id };

  let clientId = id;
  if (id) {
    const { error } = await supabase
      .from("clients")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data: row, error } = await supabase
      .from("clients")
      .insert({ ...data, owner_id: user.id, source: "manual" })
      .select("id")
      .single();
    if (error) return { error: error.message };
    clientId = row.id;
  }
  await supabase.rpc("refresh_client_scores", { p_today: todayIST() });
  revalidatePath("/", "layout");
  return { ok: true, id: clientId! };
}
