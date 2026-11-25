import Link from "next/link";
import { ChevronRight, FileUp, History, MessageSquareText, MessagesSquare } from "lucide-react";
import { getSession, isManagement } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { NotificationSettings } from "@/components/notification-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  const { supabase, profile } = await getSession();
  const title = profile.full_name?.trim() || "Me";

  // Management (Director / VP): no sales settings.
  if (isManagement(profile)) {
    return (
      <>
        <PageHeader back="/admin/team" title={title} subtitle="Management account" />
        <div className="space-y-4 p-4">
          <NotificationSettings profile={profile} management />
          <ProfileForm profile={profile} management />
          <SignOutButton />
        </div>
      </>
    );
  }

  const [{ count }, { count: templates }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("priority_pending", false),
    supabase.from("message_templates").select("id", { count: "exact", head: true }),
  ]);

  const link = (href: string, Icon: typeof History, label: string, sub: string) => (
    <Link href={href} className="card flex items-center gap-3 p-4">
      <Icon size={20} className="shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </Link>
  );

  return (
    <>
      <PageHeader back="/today" title={title} />
      <div className="space-y-4 p-4">
        {link("/messages", MessagesSquare, "From management", "Flags and messages from the Director and VP")}
        {link("/settings/history", History, "Work history", "Every meeting, call and text, day by day")}
        <NotificationSettings profile={profile} />
        <ProfileForm profile={profile} />
        {link("/settings/templates", MessageSquareText, "My WhatsApp templates", templates ? `${templates} saved` : "Ready-made messages with live quote rates")}
        {link("/settings/import", FileUp, "Upload more clients", `${count ?? 0} clients in your CRM. New ones are sent for approval.`)}
        <SignOutButton />
      </div>
    </>
  );
}
