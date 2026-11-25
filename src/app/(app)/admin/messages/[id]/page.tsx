import { notFound } from "next/navigation";
import { getManagementSession } from "@/lib/data";
import { peopleNames, threadWith } from "@/lib/messages-server";
import { uuid } from "@/lib/validate";
import { Composer, MessageThread } from "@/components/messaging";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuid((await params).id);
  if (!id) notFound();
  const { supabase, user } = await getManagementSession();
  const { names, team, management } = await peopleNames(supabase);
  const member = team.find((m) => m.id === id);
  if (!member) notFound();

  // Opening the conversation marks this salesperson's messages to me as read.
  await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", user.id).eq("sender_id", id).is("read_at", null);
  const messages = await threadWith(supabase, id, names);

  return (
    <>
      <PageHeader back="/admin/messages" title={member.full_name} subtitle="Seen by everyone in management" />
      <div className="space-y-4 p-4">
        <MessageThread messages={messages} meId={user.id} managementIds={management.map((m) => m.id)} />
        <Composer to={[id]} placeholder={`Message ${member.full_name.split(" ")[0]}`} />
      </div>
    </>
  );
}
