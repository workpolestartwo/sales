import { notFound } from "next/navigation";
import { getSession } from "@/lib/data";
import type { Client } from "@/lib/types";
import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await getSession();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <>
      <PageHeader back={`/clients/${id}`} title="Edit client" />
      <ClientForm client={data as Client} />
    </>
  );
}
