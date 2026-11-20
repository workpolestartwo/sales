import { ClientForm } from "@/components/client-form";
import { PageHeader } from "@/components/ui";

export default function NewClientPage() {
  return (
    <>
      <PageHeader back="/clients" title="Add client" />
      <ClientForm />
    </>
  );
}
