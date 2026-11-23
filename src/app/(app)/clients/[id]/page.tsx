import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getSession } from "@/lib/data";
import { formatDate, relativeDays, todayIST } from "@/lib/dates";
import type { Activity, Client } from "@/lib/types";
import { OUTCOME_LABELS, TYPE_NAMES } from "@/lib/types";
import { ClientActions } from "@/components/client-actions";
import { PageHeader, TierBadge, TypeIcon, tierStripe } from "@/components/ui";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await getSession();
  const today = todayIST();

  const [{ data: client }, { data: acts }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("activities").select("*, field_visits(notes)").eq("client_id", id).order("activity_date", { ascending: false }).order("created_at", { ascending: false }).limit(50),
  ]);
  if (!client) notFound();
  const c = client as Client;
  const activities = (acts ?? []) as (Activity & { field_visits: { notes: string | null } | null })[];

  const facts: [string, string][] = [
    ["Contact", c.contact_person ?? "—"],
    ["Phone", c.phone ?? "—"],
    ["Email", c.email ?? "—"],
    ["Area", c.area ?? "—"],
    ["Industry", c.industry ?? "—"],
    ["Shipments", String(c.total_shipments)],
    ["Last shipment", formatDate(c.last_shipment_date, { day: "numeric", month: "short", year: "numeric" })],
    ["Last meeting", `${formatDate(c.last_meeting_date, { day: "numeric", month: "short", year: "numeric" })} (${relativeDays(c.last_meeting_date, today)})`],
    ["Last contact", `${formatDate(c.last_contact_date, { day: "numeric", month: "short", year: "numeric" })} (${relativeDays(c.last_contact_date, today)})`],
    ["Client since", formatDate(c.first_shipment_date, { month: "short", year: "numeric" })],
  ];

  return (
    <>
      <PageHeader
        back="/clients"
        title={c.company}
        subtitle={c.status === "prospect" ? "Prospect" : c.status === "active" ? "Active client" : c.status}
        action={<Link href={`/clients/${c.id}/edit`} className="grid size-10 place-items-center rounded-full text-muted" aria-label="Edit"><Pencil size={18} /></Link>}
      />
      <div className="space-y-4 p-4">
        <section className={`card flex items-center gap-4 p-4 ${tierStripe(c.tier)}`}>
          <TierBadge tier={c.tier} />
          <div className="flex-1 text-sm">
            <p className="font-semibold">Priority {c.tier} · score {c.value_score}/100</p>
            <p className="text-muted">
              {c.next_due_date
                ? c.next_due_date <= today ? `Due for contact${c.next_due_date < today ? ` since ${formatDate(c.next_due_date)}` : " today"}` : `Next contact due ${formatDate(c.next_due_date)}`
                : "No contact due"}
              {c.next_follow_up && ` · follow-up ${formatDate(c.next_follow_up)}`}
            </p>
          </div>
        </section>

        <ClientActions client={{ id: c.id, company: c.company, phone: c.phone, contactPerson: c.contact_person, address: c.address, area: c.area }} today={today} myName={profile.full_name ?? ""} />

        <section className="card divide-y divide-line">
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-4 py-2.5 text-sm">
              <span className="w-28 shrink-0 text-muted">{k}</span>
              <span className="min-w-0 flex-1 break-words">{v}</span>
            </div>
          ))}
          {c.address && <div className="px-4 py-2.5 text-sm"><span className="text-muted">Address</span><p>{c.address}</p></div>}
          {c.notes && <div className="px-4 py-2.5 text-sm"><span className="text-muted">Notes</span><p className="whitespace-pre-wrap">{c.notes}</p></div>}
        </section>

        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">History</h2>
          {activities.length === 0 ? (
            <p className="card p-4 text-sm text-muted">Nothing logged in the app yet.</p>
          ) : (
            <ol className="card divide-y divide-line">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="mt-0.5 text-muted"><TypeIcon type={a.type} /></span>
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-semibold">{TYPE_NAMES[a.type]}</span> · {OUTCOME_LABELS[a.outcome]}
                      {a.is_cold && <span className="text-muted"> · cold</span>}
                    </p>
                    {a.notes && <p className="whitespace-pre-wrap text-muted">{a.notes}</p>}
                    {a.field_visits?.notes && <p className="whitespace-pre-wrap text-muted">Visit note: {a.field_visits.notes}</p>}
                    {a.follow_up_date && <p className="text-xs text-muted">Follow-up {formatDate(a.follow_up_date)}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDate(a.activity_date)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
