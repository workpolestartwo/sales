"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { todayIST } from "@/lib/dates";
import { int, str, type ActionResult } from "@/lib/validate";

export async function saveProfile(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: str(form.get("full_name"), 120),
      target_visits: int(form.get("target_visits"), 0, 100) ?? 0,
      target_calls: int(form.get("target_calls"), 0, 200) ?? 0,
      target_texts: int(form.get("target_texts"), 0, 300) ?? 0,
      contact_every_days: int(form.get("contact_every_days"), 1, 90) ?? 7,
      focus_count: int(form.get("focus_count"), 5, 500) ?? 60,
      stagnant_after_days: int(form.get("stagnant_after_days"), 14, 365) ?? 60,
    })
    .eq("id", user.id);
  if (error) return { error: error.message };
  // Due dates depend on the contact rule, so recompute them right away.
  await supabase.rpc("refresh_client_scores", { p_today: todayIST() });
  revalidatePath("/", "layout");
  return { ok: true };
}
