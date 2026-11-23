import { redirect } from "next/navigation";
import { getSession } from "@/lib/data";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineBar } from "@/components/offline-bar";
import { UserNameProvider } from "@/components/me-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getSession();
  if (!profile?.onboarded) redirect("/onboarding");

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <OfflineBar />
      <UserNameProvider name={profile.full_name}>{children}</UserNameProvider>
      <BottomNav />
    </div>
  );
}
