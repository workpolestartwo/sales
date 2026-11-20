import { redirect } from "next/navigation";
import { getSession } from "@/lib/data";
import { ImportWizard } from "@/components/import-wizard";

export default async function OnboardingPage() {
  const { profile } = await getSession();
  if (profile?.onboarded) redirect("/today");

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Upload your master list of clients: shipments, last shipment and last meeting dates. We&apos;ll rank them by priority and build your daily plan from it.
      </p>
      <ImportWizard firstTime doneHref="/today" />
    </main>
  );
}
