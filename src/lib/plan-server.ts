import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSuggestions } from "./suggestions";
import type { Profile } from "./types";

/**
 * Returns today's plan id. If the member skipped the Day Builder, the app's own
 * recommended suggestions become the plan, so plan-vs-actual still works.
 */
export async function ensureTodayPlan(supabase: SupabaseClient, userId: string, today: string): Promise<string> {
  const { data: existing } = await supabase.from("day_plans").select("id").eq("plan_date", today).maybeSingle();
  if (existing) return existing.id;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  const { focusArea, suggestions } = await buildSuggestions(supabase, today, profile as Profile);

  const { data: plan, error } = await supabase
    .from("day_plans")
    .insert({ owner_id: userId, plan_date: today, status: "confirmed", focus_area: focusArea, confirmed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) {
    // Lost a race with another request creating the same plan.
    const { data: again } = await supabase.from("day_plans").select("id").eq("plan_date", today).single();
    return again!.id;
  }

  const items = suggestions
    .filter((s) => s.recommended)
    .map((s) => ({ owner_id: userId, plan_id: plan.id, client_id: s.clientId, type: s.type, reason: s.reason, source: s.source }));
  if (items.length) await supabase.from("plan_items").insert(items);
  return plan.id;
}

/**
 * Links a logged activity to the matching item in today's plan (same client),
 * marks it done and returns its id. Returns null when the activity was unplanned.
 */
export async function matchPlanItem(
  supabase: SupabaseClient,
  planId: string,
  clientId: string | null,
  explicitItemId: string | null,
): Promise<string | null> {
  let itemId = explicitItemId;
  if (!itemId && clientId) {
    const { data } = await supabase
      .from("plan_items")
      .select("id")
      .eq("plan_id", planId)
      .eq("client_id", clientId)
      .in("status", ["planned", "missed"])
      .limit(1)
      .maybeSingle();
    itemId = data?.id ?? null;
  }
  if (!itemId) return null;
  await supabase.from("plan_items").update({ status: "done" }).eq("id", itemId).eq("plan_id", planId);
  return itemId;
}
