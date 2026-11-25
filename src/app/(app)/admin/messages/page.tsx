import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getManagementSession } from "@/lib/data";
import { peopleNames } from "@/lib/messages-server";
import { Composer } from "@/components/messaging";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const when = (ts: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(ts));

/** Management inbox: one conversation per salesperson, plus "message everyone". */
export default async function AdminMessagesPage() {
  const { supabase, user } = await getManagementSession();
  const [{ team }, { data: msgs }] = await Promise.all([
    peopleNames(supabase),
    supabase.from("messages").select("sender_id, recipient_id, body, created_at, read_at").order("created_at", { ascending: false }).limit(3000),
  ]);
  const memberIds = new Set(team.map((m) => m.id));

  // Latest message and unread replies per salesperson.
  const last = new Map<string, { body: string; at: string; fromMember: boolean }>();
  const unread = new Map<string, number>();
  for (const m of msgs ?? []) {
    const member = memberIds.has(m.sender_id) ? m.sender_id : memberIds.has(m.recipient_id) ? m.recipient_id : null;
    if (!member) continue;
    if (!last.has(member)) last.set(member, { body: m.body, at: m.created_at, fromMember: m.sender_id === member });
    if (m.recipient_id === user.id && !m.read_at) unread.set(member, (unread.get(member) ?? 0) + 1);
  }
  const people = [...team].sort((a, b) => (last.get(b.id)?.at ?? "").localeCompare(last.get(a.id)?.at ?? "") || a.full_name.localeCompare(b.full_name));

  return (
    <>
      <PageHeader title="Messages" subtitle="Conversations with the sales team" />
      <div className="space-y-5 p-4">
        <section className="card space-y-2 p-4">
          <p className="text-sm font-semibold">Message everyone</p>
          <Composer to="all" placeholder="Sent to every salesperson, with a notification" />
        </section>

        <ul className="card divide-y divide-line overflow-hidden">
          {people.map((p) => {
            const l = last.get(p.id);
            const n = unread.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <Link href={`/admin/messages/${p.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-bg">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${n ? "font-bold" : "font-semibold"}`}>{p.full_name}</span>
                      {l && <span className="shrink-0 text-xs text-muted">{when(l.at)}</span>}
                    </span>
                    <span className={`block truncate text-xs ${n ? "font-semibold text-ink" : "text-muted"}`}>
                      {l ? `${l.fromMember ? "" : "You: "}${l.body}` : "No messages yet"}
                    </span>
                  </span>
                  {n > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{n}</span>}
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
