import Link from "next/link";
import { getSession } from "@/lib/data";
import { PriorityQueue, type QueueClient } from "@/components/priority-queue";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PriorityPage() {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("clients")
    .select("id, company, area, contact_person")
    .eq("priority_pending", true)
    .order("area", { nullsFirst: false })
    .order("company")
    .limit(3000);
  const clients = (data ?? []) as QueueClient[];

  return (
    <>
      <PageHeader back="/clients" title="Set priority" subtitle={clients.length ? `${clients.length} clients waiting` : undefined} />
      <div className="p-4">
        {clients.length === 0 ? (
          <Empty title="All set">
            Every client has a priority. <Link href="/today" className="font-semibold text-brand">Build your day →</Link>
          </Empty>
        ) : (
          <PriorityQueue clients={clients} />
        )}
      </div>
    </>
  );
}
