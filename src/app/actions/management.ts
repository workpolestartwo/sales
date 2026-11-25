"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type PushPayload } from "@/lib/push";
import { str, uuid, type ActionResult } from "@/lib/validate";

async function isManagement(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]) {
  const { data } = await supabase.rpc("is_admin");
  return data === true;
}

/** Best-effort phone notification to some users (needs the service role to read their subscriptions). */
async function notify(userIds: string[], payload: PushPayload) {
  if (!userIds.length) return;
  try {
    const admin = createAdminClient();
    const { data: subs } = await admin.from("push_subscriptions").select("id, owner_id, endpoint, p256dh, auth").in("owner_id", userIds);
    if (subs?.length) await sendPush(admin, subs, payload);
  } catch {
    // The message/flag is saved either way; it shows in the app.
  }
}

async function myName(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], id: string) {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return data?.full_name?.trim() || "Management";
}

/** Management → one salesperson, several, or everyone. */
export async function sendToTeam(input: { to: string[] | "all"; body: string }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!(await isManagement(supabase))) return { error: "Only management can do this." };
  const body = str(input.body, 4000);
  if (!body) return { error: "Write a message." };

  const { data: team } = await supabase.rpc("team_members");
  const members = new Set(((team ?? []) as { id: string }[]).map((m) => m.id));
  const to = input.to === "all" ? [...members] : (Array.isArray(input.to) ? input.to : []).map(uuid).filter((id): id is string => !!id && members.has(id));
  if (!to.length) return { error: "Pick who to send it to." };

  const group = crypto.randomUUID();
  const { error } = await supabase.from("messages").insert(to.map((r) => ({ group_id: group, sender_id: user.id, recipient_id: r, body })));
  if (error) return { error: error.message };
  await notify(to, { title: `Message from ${await myName(supabase, user.id)}`, body: body.slice(0, 140), url: "/messages", tag: `msg-${group}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Salesperson → management (every management account gets it). */
export async function replyToManagement(bodyInput: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const body = str(bodyInput, 4000);
  if (!body) return { error: "Write a message." };
  const { data: mgmt } = await supabase.rpc("management_members");
  const to = ((mgmt ?? []) as { id: string }[]).map((m) => m.id).filter((id) => id !== user.id);
  if (!to.length) return { error: "There's no management account to send to yet." };

  const group = crypto.randomUUID();
  const { error } = await supabase.from("messages").insert(to.map((r) => ({ group_id: group, sender_id: user.id, recipient_id: r, body })));
  if (error) return { error: error.message };
  await notify(to, { title: `Message from ${await myName(supabase, user.id)}`, body: body.slice(0, 140), url: `/admin/messages/${user.id}`, tag: `msg-${group}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Marks messages sent to me as read (optionally only those from one person). */
export async function markRead(fromId?: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  let q = supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null);
  const from = uuid(fromId);
  if (from) q = q.eq("sender_id", from);
  await q;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Management flags a salesperson, optionally about one of their clients. */
export async function createFlag(input: { memberId: string; clientId?: string | null; note: string }): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!(await isManagement(supabase))) return { error: "Only management can do this." };
  const memberId = uuid(input.memberId);
  const note = str(input.note, 2000);
  if (!memberId || !note) return { error: "Write what needs attention." };
  const clientId = uuid(input.clientId);

  const { error } = await supabase.from("flags").insert({ member_id: memberId, client_id: clientId, note });
  if (error) return { error: error.message };
  let about = "";
  if (clientId) {
    const { data } = await supabase.rpc("admin_client", { p_client: clientId });
    about = (data as { company: string }[] | null)?.[0]?.company ?? "";
  }
  await notify([memberId], { title: `Flag from ${await myName(supabase, user.id)}${about ? `: ${about}` : ""}`, body: note.slice(0, 140), url: "/messages", tag: "flag" });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The flagged salesperson (or management) closes a flag, optionally with a reply. */
export async function closeFlag(id: string, doneNote?: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const flagId = uuid(id);
  if (!flagId) return { error: "Invalid flag." };
  const { error } = await supabase.from("flags").update({ status: "done", done_note: str(doneNote, 1000), done_at: new Date().toISOString() }).eq("id", flagId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function reopenFlag(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!(await isManagement(supabase))) return { error: "Only management can do this." };
  const flagId = uuid(id);
  if (!flagId) return { error: "Invalid flag." };
  const { error } = await supabase.from("flags").update({ status: "open", done_at: null }).eq("id", flagId);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
