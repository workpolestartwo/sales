import { getSalesSession } from "@/lib/data";
import { peopleNames, threadWith } from "@/lib/messages-server";
import { Composer, FlagCard, MessageThread, type FlagItem } from "@/components/messaging";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** A salesperson's page for management: flags to deal with, and the conversation. */
export default async function MessagesPage() {
  const { supabase, user } = await getSalesSession();
  await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).is("read_at", null);
  const [{ names }, { data: flags }] = await Promise.all([
    peopleNames(supabase),
    supabase.from("flags").select("id, note, status, created_by_name, created_at, done_note, done_at, client_id, clients(company)").eq("member_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);
  const messages = await threadWith(supabase, user.id, names);
  const all = ((flags ?? []) as unknown as (FlagItem & { clients: { company: string } | null })[]).map((f) => ({ ...f, company: f.clients?.company ?? null }));
  const open = all.filter((f) => f.status === "open");
  const done = all.filter((f) => f.status === "done").slice(0, 5);

  return (
    <>
      <PageHeader back="/today" title="From management" subtitle="Flags and messages from the Director and VP" />
      <div className="space-y-5 p-4">
        {open.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-bold">Needs your attention · {open.length}</h2>
            {open.map((f) => <FlagCard key={f.id} flag={f} canClose />)}
          </section>
        )}
        <section className="space-y-3">
          <h2 className="px-1 text-sm font-bold">Messages</h2>
          <MessageThread messages={messages} meId={user.id} />
          <Composer to="management" placeholder="Reply to management" />
        </section>
        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-bold text-muted">Done</h2>
            {done.map((f) => <FlagCard key={f.id} flag={f} />)}
          </section>
        )}
      </div>
    </>
  );
}
