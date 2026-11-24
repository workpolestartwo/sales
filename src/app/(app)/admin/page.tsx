import { notFound } from "next/navigation";
import { getSession } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { AdminTabs } from "@/components/admin-tabs";
import { MasterList, type MasterRow } from "@/components/master-list";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminMasterListPage() {
  const { supabase, profile } = await getSession();
  if (profile.role !== "admin") notFound();
  const { data, error } = await supabase.rpc("admin_master_list");

  return (
    <>
      <PageHeader back="/settings" title="Admin" subtitle="Every client of every salesperson" />
      <div className="space-y-4 p-4">
        <AdminTabs active="clients" />
        {error ? <p className="text-sm text-red-600">Couldn&apos;t load the master list: {error.message}</p> : <MasterList rows={(data ?? []) as MasterRow[]} today={todayIST()} />}
      </div>
    </>
  );
}
