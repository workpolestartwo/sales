import Link from "next/link";
import { notFound } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getManagementSession } from "@/lib/data";
import { addDays, todayIST, weekRange } from "@/lib/dates";
import { WORKING_DAYS } from "@/lib/reports";
import { uuid } from "@/lib/validate";
import { TeamPerformance, type MemberStats } from "@/components/team-performance";
import { WorkHistory, type HistoryEntry } from "@/components/work-history";
import { FlagCard, FlagForm, type FlagItem } from "@/components/messaging";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuid((await params).id);
  if (!id) notFound();
  const { supabase } = await getManagementSession();
  const today = todayIST();
  const { start } = weekRange(today);

  const [{ data: perf }, { data: acts }, { data: flags }] = await Promise.all([
    supabase.rpc("admin_team_performance", { p_start: start, p_end: today }),
    supabase.rpc("admin_member_activity", { p_member: id, p_since: addDays(today, -30) }),
    supabase.from("flags").select("id, note, status, created_by_name, created_at, done_note, done_at, client_id").eq("member_id", id).order("status", { ascending: false }).order("created_at", { ascending: false }).limit(50),
  ]);
  const member = ((perf ?? []) as MemberStats[]).find((m) => m.member_id === id);
  if (!member) notFound();

  const history: HistoryEntry[] = ((acts ?? []) as { id: string; type: HistoryEntry["type"]; activity_date: string; outcome: HistoryEntry["outcome"]; notes: string | null; follow_up_date: string | null; is_cold: boolean; created_at: string; client_id: string | null; company: string | null; area: string | null }[])
    .map((a) => ({ ...a, plan_item_id: "-", field_visit_id: null, field_visits: null, clients: a.company ? { company: a.company, area: a.area } : null }));
  const openFlags = ((flags ?? []) as FlagItem[]).filter((f) => f.status === "open");
  const doneFlags = ((flags ?? []) as FlagItem[]).filter((f) => f.status === "done").slice(0, 5);

  return (
    <>
      <PageHeader back="/admin/team" title={member.member_name} subtitle="This week, flags and recent work" />
      <div className="space-y-5 p-4">
        <TeamPerformance members={[member]} workingDays={WORKING_DAYS} today={today} openFlags={{ [id]: openFlags.length }} />

        <div className="grid grid-cols-2 gap-2">
          <Link href={`/admin/messages/${id}`} className="btn-secondary"><MessagesSquare size={16} /> Message</Link>
          <Link href={`/admin/clients?owner=${id}`} className="btn-secondary">Their clients</Link>
        </div>
        <FlagForm memberId={id} label={`Flag something for ${member.member_name.split(" ")[0]}`} />

        {(openFlags.length > 0 || doneFlags.length > 0) && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-bold">Flags</h2>
            {openFlags.map((f) => <FlagCard key={f.id} flag={f} />)}
            {doneFlags.map((f) => <FlagCard key={f.id} flag={f} canReopen />)}
          </section>
        )}

        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">Last 30 days</h2>
          <WorkHistory entries={history} today={today} />
        </section>
      </div>
    </>
  );
}
