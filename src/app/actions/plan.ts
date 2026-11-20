"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayIST } from "@/lib/dates";
import { activityType, str, uuid, type ActionResult } from "@/lib/validate";

interface PlanItemInput {
  clientId: string;
  type: string;
  reason?: string;
  source?: string;
}

/** Saves the morning plan built in the Day Builder and confirms it. */
export async function confirmPlan(input: { focusArea: string | null; items: PlanItemInput[] }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const today = todayIST();
  if (!Array.isArray(input.items) || input.items.length > 300) return { error: "Invalid plan." };

  const items = input.items
    .map((i) => ({
      client_id: uuid(i.clientId),
      type: activityType(i.type),
      reason: str(i.reason, 300),
      source: i.source === "backlog" || i.source === "suggested" ? i.source : "manual",
    }))
    .filter((i) => i.client_id && i.type);
  if (items.length === 0) return { error: "Pick at least one client for today." };

  const { data: existing } = await supabase.from("day_plans").select("id, status").eq("plan_date", today).maybeSingle();
  if (existing && existing.status !== "draft") return { error: "Today's plan is already confirmed." };

  let planId = existing?.id as string | undefined;
  const planFields = { focus_area: str(input.focusArea, 100), status: "confirmed", confirmed_at: new Date().toISOString() };
  if (planId) {
    await supabase.from("day_plans").update(planFields).eq("id", planId);
    await supabase.from("plan_items").delete().eq("plan_id", planId);
  } else {
    const { data, error } = await supabase
      .from("day_plans")
      .insert({ owner_id: user.id, plan_date: today, ...planFields })
      .select("id")
      .single();
    if (error) return { error: error.message };
    planId = data.id;
  }

  const { error } = await supabase
    .from("plan_items")
    .insert(items.map((i) => ({ ...i, owner_id: user.id, plan_id: planId })));
  if (error) return { error: error.message };

  revalidatePath("/today");
  return { ok: true };
}

/** Adds an item to an already-confirmed plan (tracked as added after confirm). */
export async function addPlanItem(input: { clientId: string; type: string }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const clientId = uuid(input.clientId);
  const type = activityType(input.type);
  if (!clientId || !type) return { error: "Invalid item." };

  const { data: plan } = await supabase.from("day_plans").select("id, status").eq("plan_date", todayIST()).maybeSingle();
  if (!plan || plan.status === "closed") return { error: "No open plan for today." };

  const { data: dup } = await supabase.from("plan_items").select("id").eq("plan_id", plan.id).eq("client_id", clientId).neq("status", "dropped").maybeSingle();
  if (dup) return { error: "That client is already in today's plan." };

  const { error } = await supabase.from("plan_items").insert({
    owner_id: user.id, plan_id: plan.id, client_id: clientId, type, source: "manual", added_after_confirm: plan.status === "confirmed",
  });
  if (error) return { error: error.message };
  revalidatePath("/today");
  return { ok: true };
}

/** Drops an item. It stays in the plan as "dropped" so the comparison stays honest. */
export async function setItemDropped(itemId: string, dropped: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const id = uuid(itemId);
  if (!id) return { error: "Invalid item." };
  const { error } = await supabase
    .from("plan_items")
    .update({ status: dropped ? "dropped" : "planned" })
    .eq("id", id)
    .in("status", dropped ? ["planned"] : ["dropped"]);
  if (error) return { error: error.message };
  revalidatePath("/today");
  return { ok: true };
}

/** Ends the day: unfinished items become missed and flow into tomorrow's backlog. */
export async function closeDay(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const today = todayIST();
  const { data: plan } = await supabase.from("day_plans").select("id, status").eq("plan_date", today).maybeSingle();
  if (!plan) return { error: "There's no plan for today." };
  if (plan.status === "closed") return { ok: true };

  await supabase.from("plan_items").update({ status: "missed" }).eq("plan_id", plan.id).eq("status", "planned");
  await supabase.from("day_plans").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", plan.id);
  await supabase.rpc("refresh_client_scores", { p_today: today });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Re-opens today's plan if the member closed it by mistake. */
export async function reopenDay(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: plan } = await supabase.from("day_plans").select("id, status").eq("plan_date", todayIST()).maybeSingle();
  if (!plan || plan.status !== "closed") return { ok: true };
  await supabase.from("plan_items").update({ status: "planned" }).eq("plan_id", plan.id).eq("status", "missed");
  await supabase.from("day_plans").update({ status: "confirmed", closed_at: null }).eq("id", plan.id);
  revalidatePath("/", "layout");
  return { ok: true };
}
