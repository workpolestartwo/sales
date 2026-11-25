import { cache } from "react";
import { requireUser } from "./supabase/server";
import type { Client, Profile } from "./types";

/** Signed-in user + profile, deduplicated per request. */
export const getSession = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return { supabase, user, profile: data as Profile };
});

/** Management (Director / VP) accounts don't sell. */
export const isManagement = (profile: Pick<Profile, "role"> | null | undefined) => profile?.role === "admin";

/** For sales screens: management accounts are sent to their own home instead. */
export async function getSalesSession() {
  const session = await getSession();
  if (isManagement(session.profile)) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/team");
  }
  return session;
}

/** For management screens: anyone else gets a 404. */
export async function getManagementSession() {
  const session = await getSession();
  if (!isManagement(session.profile)) {
    const { notFound } = await import("next/navigation");
    notFound();
  }
  return session;
}

export type ClientOption = Pick<Client, "id" | "company" | "contact_person" | "area" | "tier" | "phone" | "status">;

/** Lightweight client list for pickers and dropdowns. */
export const getClientOptions = cache(async (): Promise<ClientOption[]> => {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("clients")
    .select("id, company, contact_person, area, tier, phone, status")
    .neq("status", "lost")
    .eq("priority_pending", false)
    .order("company")
    .limit(5000);
  return (data ?? []) as ClientOption[];
});
