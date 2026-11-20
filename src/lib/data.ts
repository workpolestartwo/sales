import { cache } from "react";
import { requireUser } from "./supabase/server";
import type { Client, Profile } from "./types";

/** Signed-in user + profile, deduplicated per request. */
export const getSession = cache(async () => {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return { supabase, user, profile: data as Profile };
});

export type ClientOption = Pick<Client, "id" | "company" | "contact_person" | "area" | "tier" | "phone" | "status">;

/** Lightweight client list for pickers and dropdowns. */
export const getClientOptions = cache(async (): Promise<ClientOption[]> => {
  const { supabase } = await getSession();
  const { data } = await supabase
    .from("clients")
    .select("id, company, contact_person, area, tier, phone, status")
    .neq("status", "lost")
    .order("company")
    .limit(5000);
  return (data ?? []) as ClientOption[];
});
