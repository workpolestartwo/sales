import { getManagementSession } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { MasterList, type MasterRow } from "@/components/master-list";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const { owner } = await searchParams;
  const { supabase } = await getManagementSession();
  const { data, error } = await supabase.rpc("admin_master_list");
  return (
    <>
      <PageHeader title="All clients" subtitle="Every salesperson's clients" />
      <div className="p-4">
        {error ? <p className="text-sm text-red-600">Couldn&apos;t load the master list: {error.message}</p> : <MasterList rows={(data ?? []) as MasterRow[]} today={todayIST()} initialOwner={owner ?? ""} />}
      </div>
    </>
  );
}
