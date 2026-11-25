import Link from "next/link";
import { ChevronRight, Flag, Inbox, MessagesSquare } from "lucide-react";
import { getSession } from "@/lib/data";

function Banner({ href, tone, Icon, title, sub, cta }: { href: string; tone: "amber" | "red" | "blue"; Icon: typeof Inbox; title: string; sub: string; cta: string }) {
  const tones = {
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };
  return (
    <Link href={href} className={`card flex min-h-16 items-center gap-3 px-4 py-3 ${tones[tone]}`}>
      <Icon size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs opacity-90">{sub}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold">{cta} <ChevronRight size={16} /></span>
    </Link>
  );
}

/**
 * Shown on Today and Clients:
 * - flags and unread messages from management,
 * - new clients waiting to join the CRM (approve, then set priority).
 */
export async function InboxBanners() {
  const { supabase, user } = await getSession();
  const [{ count: toApprove }, { count: toPrioritise }, { data: flags }, { count: unread }] = await Promise.all([
    supabase.from("client_assignments").select("id", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "pending"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("priority_pending", true),
    supabase.from("flags").select("note").eq("member_id", user.id).eq("status", "open").order("created_at", { ascending: false }).limit(20),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null),
  ]);
  const waiting = (toApprove ?? 0) + (toPrioritise ?? 0);
  const openFlags = flags ?? [];
  if (!waiting && !openFlags.length && !unread) return null;

  return (
    <div className="space-y-2">
      {openFlags.length > 0 && (
        <Banner href="/messages" tone="red" Icon={Flag}
          title={openFlags.length === 1 ? "Flag from management" : `${openFlags.length} flags from management`}
          sub={openFlags[0].note} cta="Open" />
      )}
      {!!unread && (
        <Banner href="/messages" tone="blue" Icon={MessagesSquare}
          title={`${unread} new message${unread === 1 ? "" : "s"} from management`} sub="Tap to read and reply" cta="Read" />
      )}
      {waiting > 0 && (
        <Banner href={toApprove ? "/assignments" : "/clients/priority"} tone="amber" Icon={Inbox}
          title={`${waiting} new client${waiting === 1 ? "" : "s"} waiting to join your CRM`}
          sub={toApprove ? "Approve them, then set their priority" : "Set their priority to add them"} cta={toApprove ? "Review" : "Set"} />
      )}
    </div>
  );
}
