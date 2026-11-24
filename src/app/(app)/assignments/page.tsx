import Link from "next/link";
import { getSession } from "@/lib/data";
import { getTeam } from "@/app/actions/assignments";
import { AssignmentReview, type PendingAssignment } from "@/components/assignment-review";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AssignmentsPage() {
  const { supabase, user } = await getSession();
  const [{ data }, team, { count: needPriority }] = await Promise.all([
    supabase
      .from("client_assignments")
      .select("id, batch_id, company, area, contact_person, phone, assigned_by, assigned_by_name, created_at")
      .eq("assignee_id", user.id)
      .eq("status", "pending")
      .order("created_at")
      .order("company")
      .limit(3000),
    getTeam(),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("priority_pending", true),
  ]);
  const rows = (data ?? []) as PendingAssignment[];

  return (
    <>
      <PageHeader back="/today" title="New clients to approve" subtitle="They join your CRM once approved and given a priority" />
      <div className="space-y-4 p-4">
        {rows.length === 0 ? (
          <Empty title="Nothing to approve">
            {needPriority ? (
              <Link href="/clients/priority" className="font-semibold text-brand">Set priority for {needPriority} approved clients →</Link>
            ) : "When someone puts clients under your name, they'll show up here."}
          </Empty>
        ) : (
          <AssignmentReview rows={rows} team={team.filter((m) => m.id !== user.id)} meId={user.id} />
        )}
      </div>
    </>
  );
}
