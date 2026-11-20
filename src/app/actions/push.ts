"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { sendPush } from "@/lib/push";
import { str, type ActionResult } from "@/lib/validate";

/** Saves this phone's push subscription for the signed-in member. */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const endpoint = str(sub?.endpoint, 1000);
  if (!endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Invalid subscription." };
  // A phone's endpoint is unique; if it belonged to someone else who signed out here, it moves to this member.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    owner_id: user.id,
    endpoint,
    p256dh: str(sub.keys.p256dh, 200),
    auth: str(sub.keys.auth, 100),
    user_agent: str(userAgent, 300),
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("endpoint", String(endpoint));
  return { ok: true };
}

export async function sendTestPush(): Promise<ActionResult & { sent?: number }> {
  const { supabase } = await requireUser();
  const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  if (!subs?.length) return { error: "Notifications aren't turned on for any of your phones yet." };
  const sent = await sendPush(supabase, subs, { title: "Notifications are working ✅", body: "You'll get your morning plan and evening wrap-up reminders here.", url: "/today", tag: "test" });
  return sent ? { ok: true, sent } : { error: "Couldn't reach your phone. Try turning notifications off and on again." };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveReminderSettings(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const morning = String(form.get("morning_time") ?? "");
  const evening = String(form.get("evening_time") ?? "");
  if (!TIME.test(morning) || !TIME.test(evening)) return { error: "Pick valid times." };
  if (morning >= evening) return { error: "The morning reminder should be before the evening one." };
  const { error } = await supabase
    .from("profiles")
    .update({ notify_enabled: form.get("notify_enabled") === "on", morning_time: morning, evening_time: evening })
    .eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
