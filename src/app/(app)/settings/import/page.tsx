import { getSession } from "@/lib/data";
import { getTeam } from "@/app/actions/assignments";
import { ImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const [{ user }, team] = await Promise.all([getSession(), getTeam()]);
  return (
    <>
      <PageHeader back="/clients" title="Upload more clients" subtitle="Teammates' clients are sent to them for approval" />
      <div className="p-4">
        <ImportWizard firstTime={false} doneHref="/clients" team={team} meId={user.id} />
      </div>
    </>
  );
}
