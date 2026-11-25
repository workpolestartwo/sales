import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getManagementSession } from "@/lib/data";
import { addDays, formatDate, todayIST, weekRange } from "@/lib/dates";
import { WORKING_DAYS } from "@/lib/reports";
import { TeamPerformance, type MemberStats } from "@/components/team-performance";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: d } = await searchParams;
  const { supabase } = await getManagementSession();

  const today = todayIST();
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;
  const { start, end } = weekRange(date);
  const upTo = end < today ? end : today;
  const [{ data, error }, { data: flags }] = await Promise.all([
    supabase.rpc("admin_team_performance", { p_start: start, p_end: upTo }),
    supabase.from("flags").select("member_id").eq("status", "open"),
  ]);
  const openFlags: Record<string, number> = {};
  for (const f of flags ?? []) openFlags[f.member_id] = (openFlags[f.member_id] ?? 0) + 1;
  const nextStart = addDays(start, 7);

  return (
    <>
      <PageHeader title="Team" subtitle="How each salesperson is doing" />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Link href={`/admin/team?date=${addDays(start, -7)}`} className="grid size-10 place-items-center rounded-full border border-line bg-surface" aria-label="Previous week"><ChevronLeft size={18} /></Link>
          <span className="text-sm font-semibold">{start <= today && today <= end ? "This week" : `${formatDate(start)} – ${formatDate(end)}`}</span>
          {nextStart <= today
            ? <Link href={`/admin/team?date=${nextStart}`} className="grid size-10 place-items-center rounded-full border border-line bg-surface" aria-label="Next week"><ChevronRight size={18} /></Link>
            : <span className="size-10" />}
        </div>
        {error
          ? <p className="text-sm text-red-600">Couldn&apos;t load team performance: {error.message}</p>
          : <TeamPerformance members={(data ?? []) as MemberStats[]} workingDays={WORKING_DAYS} today={today} openFlags={openFlags} />}
      </div>
    </>
  );
}
