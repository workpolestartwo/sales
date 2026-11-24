"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayIST } from "@/lib/dates";
import { CONTAINER_LABELS, CONTAINER_TYPES, money, suggestedQuote, type Rate } from "@/lib/rates";
import { STARTER_TEMPLATES, type QuoteLane, type Template } from "@/lib/templates";
import { str, uuid, type ActionResult } from "@/lib/validate";


/** The member's own templates. The first time, they get a few starters to edit. */
export async function listTemplates(): Promise<Template[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("message_templates").select("id, name, body").order("created_at");
  if (data && data.length > 0) return data;

  const { data: profile } = await supabase.from("profiles").select("templates_seeded").eq("id", user.id).maybeSingle();
  if (profile?.templates_seeded) return [];
  const { data: seeded } = await supabase
    .from("message_templates")
    .insert(STARTER_TEMPLATES.map((t) => ({ ...t, owner_id: user.id })))
    .select("id, name, body");
  await supabase.from("profiles").update({ templates_seeded: true }).eq("id", user.id);
  return seeded ?? [];
}

export async function saveTemplate(input: { id?: string; name: string; body: string }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = str(input.name, 60);
  const body = str(input.body, 2000);
  if (!name || !body) return { error: "Give the template a name and a message." };
  const id = uuid(input.id);
  const { error } = id
    ? await supabase.from("message_templates").update({ name, body, updated_at: new Date().toISOString() }).eq("id", id)
    : await supabase.from("message_templates").insert({ owner_id: user.id, name, body });
  if (error) return { error: error.message };
  revalidatePath("/settings/templates");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const tid = uuid(id);
  if (!tid) return { error: "Invalid template." };
  const { error } = await supabase.from("message_templates").delete().eq("id", tid);
  if (error) return { error: error.message };
  revalidatePath("/settings/templates");
  return { ok: true };
}

/**
 * Valid rates grouped by lane, priced at the SUGGESTED QUOTE (buy + markup).
 * Buy rates never leave the server through this, so they can't end up in a client message.
 */
export async function getQuoteLanes(): Promise<QuoteLane[]> {
  const { supabase } = await requireUser();
  const today = todayIST();
  const [{ data: rates }, { data: settings }] = await Promise.all([
    supabase.from("rates").select("*").gte("valid_until", today).order("origin").order("destination"),
    supabase.from("app_settings").select("markup_pct").eq("id", 1).maybeSingle(),
  ]);
  const markup = Number(settings?.markup_pct ?? 10);
  const lanes = new Map<string, QuoteLane & { sort: Rate[] }>();
  for (const r of (rates ?? []) as Rate[]) {
    const key = `${r.origin.toLowerCase()}|${r.destination.toLowerCase()}`;
    const lane = lanes.get(key) ?? { key, direction: r.direction, origin: r.origin, destination: r.destination, validUntil: r.valid_until, items: [], sort: [] };
    lane.sort.push(r);
    if (r.valid_until < lane.validUntil) lane.validUntil = r.valid_until;
    lanes.set(key, lane);
  }
  return [...lanes.values()].map(({ sort, ...lane }) => ({
    ...lane,
    items: sort
      .sort((a, b) => CONTAINER_TYPES.indexOf(a.container_type) - CONTAINER_TYPES.indexOf(b.container_type))
      .map((r) => ({
        label: r.container_type === "LCL" ? "Co-load" : CONTAINER_LABELS[r.container_type],
        quote: money(suggestedQuote(Number(r.buy_rate), markup), r.currency) + (r.container_type === "LCL" ? "/CBM" : ""),
      })),
  }));
}
