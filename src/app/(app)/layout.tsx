import { getSession, isManagement } from "@/lib/data";
import { BottomNav } from "@/components/bottom-nav";
import { OfflineBar } from "@/components/offline-bar";
import { UserNameProvider } from "@/components/me-link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getSession();
  const management = isManagement(profile);
  // Unread replies from the team, for the Messages badge (management only).
  const unread = management
    ? (await supabase.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", user.id).is("read_at", null)).count ?? 0
    : 0;

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <OfflineBar />
      <UserNameProvider name={profile.full_name}>{children}</UserNameProvider>
      <BottomNav management={management} unread={unread} />
    </div>
  );
}
