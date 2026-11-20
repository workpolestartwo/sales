"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { date, str, uuid, type ActionResult } from "@/lib/validate";
import { CONTAINER_TYPES, type ContainerType } from "@/lib/rates";

interface RateInput {
  direction: string;
  origin: string;
  destination: string;
  containerType: string;
  buyRate: number | string;
  currency: string;
  validUntil: string;
  source?: string;
  notes?: string;
}

/**
 * Saves a buy rate. One rate per lane + container type: saving the same lane
 * again overwrites it. The database stamps who updated it and when.
 */
export async function saveRate(input: RateInput): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const origin = str(input.origin, 80);
  const destination = str(input.destination, 80);
  const containerType = CONTAINER_TYPES.includes(input.containerType as ContainerType) ? input.containerType : null;
  const buyRate = Number(input.buyRate);
  const validUntil = date(input.validUntil);
  const direction = input.direction === "import" ? "import" : "export";
  const currency = ["USD", "INR", "EUR"].includes(input.currency) ? input.currency : "USD";

  if (!origin || !destination) return { error: "Pick both ports." };
  if (origin.toLowerCase() === destination.toLowerCase()) return { error: "Origin and destination can't be the same port." };
  if (!containerType) return { error: "Pick a container type." };
  if (!Number.isFinite(buyRate) || buyRate < 0 || buyRate > 10_000_000) return { error: "Enter a valid buy rate." };
  if (!validUntil) return { error: "Pick how long the rate is valid." };

  const { error } = await supabase.from("rates").upsert(
    {
      direction,
      origin,
      destination,
      container_type: containerType,
      buy_rate: Math.round(buyRate * 100) / 100,
      currency,
      valid_until: validUntil,
      source: str(input.source, 120),
      notes: str(input.notes, 500),
    },
    { onConflict: "origin_key,destination_key,container_type" },
  );
  if (error) return { error: error.message };
  revalidatePath("/rates");
  return { ok: true };
}

export async function deleteRate(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const rateId = uuid(id);
  if (!rateId) return { error: "Invalid rate." };
  const { data, error } = await supabase.from("rates").delete().eq("id", rateId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Only the person who last updated this rate can delete it." };
  revalidatePath("/rates");
  return { ok: true };
}
