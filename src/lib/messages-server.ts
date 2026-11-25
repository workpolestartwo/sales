import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThreadMessage } from "@/components/messaging";

/** Names of everyone (salespeople + management), for labelling messages. */
export async function peopleNames(supabase: SupabaseClient) {
  const [{ data: team }, { data: mgmt }] = await Promise.all([supabase.rpc("team_members"), supabase.rpc("management_members")]);
  const names = new Map<string, string>();
  for (const p of [...((team ?? []) as { id: string; full_name: string }[]), ...((mgmt ?? []) as { id: string; full_name: string }[])]) names.set(p.id, p.full_name);
  return { names, team: (team ?? []) as { id: string; full_name: string }[], management: (mgmt ?? []) as { id: string; full_name: string }[] };
}

/** All messages to or from one salesperson, oldest first. */
export async function threadWith(supabase: SupabaseClient, memberId: string, names: Map<string, string>): Promise<ThreadMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("id, group_id, sender_id, body, created_at")
    .or(`sender_id.eq.${memberId},recipient_id.eq.${memberId}`)
    .order("created_at")
    .limit(1000);
  return ((data ?? []) as Omit<ThreadMessage, "sender_name">[]).map((m) => ({ ...m, sender_name: names.get(m.sender_id) ?? "Someone" }));
}
