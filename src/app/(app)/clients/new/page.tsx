import { getSalesSession } from "@/lib/data";
import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";

export default async function NewClientPage() {
  await getSalesSession();
  return (
    <>
      <PageHeader back="/clients" title="Add client" />
      <ClientForm />
    </>
  );
}
