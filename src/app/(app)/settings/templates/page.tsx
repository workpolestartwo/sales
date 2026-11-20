import { listTemplates } from "@/app/actions/templates";
import { TemplateManager } from "@/components/template-manager";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();
  return (
    <>
      <PageHeader back="/settings" title="My WhatsApp templates" subtitle="Only you can see these" />
      <TemplateManager templates={templates} />
    </>
  );
}
