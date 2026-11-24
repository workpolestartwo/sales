import Link from "next/link";
import { ChevronRight, Inbox } from "lucide-react";
import { getSession } from "@/lib/data";

/**
 * Stays at the top of Today and Clients while new clients are waiting to join the CRM:
 * first they need approving, then a priority. Until both are done they don't appear anywhere else.
 */
export async function InboxBanners() {
  const { supabase, user } = await getSession();
  const [{ count: toApprove }, { count: toPrioritise }] = await Promise.all([
    supabase.from("client_assignments").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "pending"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("priority_pending", true),
  ]);
  const waiting = (toApprove ?? 0) + (toPrioritise ?? 0);
  if (!waiting) return null;

  const step = toApprove ? "Approve them, then set their priority" : "Set their priority to add them";
  return (
    <Link href={toApprove ? "/assignments" : "/clients/priority"} className="card flex min-h-16 items-center gap-3 border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <Inbox size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{waiting} new client{waiting === 1 ? "" : "s"} waiting to join your CRM</span>
        <span className="block truncate text-xs text-amber-800">{step}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold">{toApprove ? "Review" : "Set"} <ChevronRight size={16} /></span>
    </Link>
  );
}
