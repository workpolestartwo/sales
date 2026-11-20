import Link from "next/link";
import { FileUp, MessageSquareText } from "lucide-react";
import { getSession } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { NotificationSettings } from "@/components/notification-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  const { supabase, user, profile } = await getSession();
  const [{ count }, { count: templates }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("message_templates").select("id", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageHeader title="Me" subtitle={user.email ?? undefined} />
      <div className="space-y-4 p-4">
        <NotificationSettings profile={profile} />
        <ProfileForm profile={profile} />

        <Link href="/settings/templates" className="card flex items-center gap-3 p-4">
          <MessageSquareText size={20} className="text-brand" />
          <div className="flex-1">
            <p className="text-sm font-semibold">My WhatsApp templates</p>
            <p className="text-xs text-muted">{templates ? `${templates} saved` : "Ready-made messages with live quote rates"}</p>
          </div>
        </Link>

        <Link href="/settings/import" className="card flex items-center gap-3 p-4">
          <FileUp size={20} className="text-brand" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Upload more clients</p>
            <p className="text-xs text-muted">{count ?? 0} clients in your list. Duplicates are merged, never added twice.</p>
          </div>
        </Link>

        <SignOutButton />
      </div>
    </>
  );
}
