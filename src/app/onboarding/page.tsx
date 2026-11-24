import { redirect } from "next/navigation";
import { getSession } from "@/lib/data";
import { getTeam } from "@/app/actions/assignments";
import { ImportWizard } from "@/components/import-wizard";

export default async function OnboardingPage() {
  const [{ profile, user }, team] = await Promise.all([getSession(), getTeam()]);
  if (profile?.onboarded) redirect("/today");

  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold">Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        Upload your list of clients. If it includes other salespeople&apos;s clients, they&apos;re sent to them for approval.
      </p>
      <ImportWizard firstTime doneHref="/today" team={team} meId={user.id} />
    </main>
  );
}
