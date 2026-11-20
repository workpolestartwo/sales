import { ImportWizard } from "@/components/import-wizard";
import { PageHeader } from "@/components/ui";

export default function ImportPage() {
  return (
    <>
      <PageHeader back="/clients" title="Add more clients" subtitle="Upload a sheet. Duplicates are detected automatically" />
      <div className="p-4">
        <ImportWizard firstTime={false} doneHref="/clients" />
      </div>
    </>
  );
}
