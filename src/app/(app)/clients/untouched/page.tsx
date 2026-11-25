import { getSalesSession } from "@/lib/data";
import { addDays, todayIST } from "@/lib/dates";
import type { Client } from "@/lib/types";
import { UntouchedList, type UntouchedRow } from "@/components/untouched-list";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function UntouchedPage() {
  const { supabase, profile } = await getSalesSession();
  const today = todayIST();
  const days = profile.stagnant_after_days ?? 60;
  const before = addDays(today, -days);

  const { data } = await supabase
    .from("clients")
    .select("id, company, contact_person, phone, area, tier, status, value_score, total_shipments, last_shipment_date, last_touch_date, next_follow_up")
    .neq("status", "lost")
    .eq("priority_pending", false)
    .or(`last_touch_date.is.null,last_touch_date.lt.${before}`)
    .order("value_score", { ascending: false })
    .limit(3000);

  const rows = ((data ?? []) as Client[]).map<UntouchedRow>((c) => ({
    id: c.id,
    company: c.company,
    contactPerson: c.contact_person,
    phone: c.phone,
    area: c.area,
    tier: c.tier,
    status: c.status,
    score: c.value_score,
    shipments: c.total_shipments,
    lastShipment: c.last_shipment_date,
    lastTouch: c.last_touch_date,
    followUp: c.next_follow_up,
  }));

  return (
    <>
      <PageHeader back="/clients" title="Untouched clients" subtitle={`No contact in ${days}+ days · most valuable first`} />
      <UntouchedList rows={rows} today={today} days={days} />
    </>
  );
}
