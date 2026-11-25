import Link from "next/link";
import { notFound } from "next/navigation";
import { getManagementSession } from "@/lib/data";
import { formatDate, relativeDays, todayIST } from "@/lib/dates";
import { uuid } from "@/lib/validate";
import { TYPE_NAMES, outcomeLabel, type ActivityType, type Outcome, type Tier } from "@/lib/types";
import { FlagCard, FlagForm, type FlagItem } from "@/components/messaging";
import { PageHeader, TierBadge, TypeIcon, tierStripe } from "@/components/ui";

export const dynamic = "force-dynamic";

interface AdminClient {
  id: string; company: string; contact_person: string | null; phone: string | null; email: string | null; area: string | null;
  address: string | null; industry: string | null; total_shipments: number; last_shipment_date: string | null; last_touch_date: string | null;
  next_due_date: string | null; next_follow_up: string | null; tier: Tier; status: string; priority_pending: boolean; notes: string | null;
  owner_id: string; owner_name: string;
}

export default async function AdminClientPage({ params }: { params: Promise<{ id: string }> }) {
  const id = uuid((await params).id);
  if (!id) notFound();
  const { supabase } = await getManagementSession();
  const today = todayIST();

  const [{ data: rows }, { data: acts }, { data: flags }] = await Promise.all([
    supabase.rpc("admin_client", { p_client: id }),
    supabase.rpc("admin_client_activity", { p_client: id }),
    supabase.from("flags").select("id, note, status, created_by_name, created_at, done_note, done_at, client_id").eq("client_id", id).order("created_at", { ascending: false }),
  ]);
  const c = ((rows ?? []) as AdminClient[])[0];
  if (!c) notFound();
  const history = (acts ?? []) as { id: string; type: ActivityType; activity_date: string; outcome: Outcome; notes: string | null; follow_up_date: string | null }[];

  const facts: [string, string][] = [
    ["Salesperson", c.owner_name],
    ["Priority", c.priority_pending ? "Not set yet" : c.tier === "A" ? "Top" : c.tier === "B" ? "Medium" : "Low"],
    ["Last contact", `${formatDate(c.last_touch_date, { day: "numeric", month: "short", year: "numeric" })} (${relativeDays(c.last_touch_date, today)})`],
    ["Next due", c.next_due_date ? formatDate(c.next_due_date) : "—"],
    ["Contact", c.contact_person ?? "—"],
    ["Phone", c.phone ?? "—"],
    ["Area", c.area ?? "—"],
    ["Industry", c.industry ?? "—"],
    ["Shipments", String(c.total_shipments)],
  ];

  return (
    <>
      <PageHeader back="/admin/clients" title={c.company} subtitle={`${c.owner_name}'s client`} />
      <div className="space-y-5 p-4">
        <section className={`card divide-y divide-line ${tierStripe(c.priority_pending ? null : c.tier)}`}>
          <div className="flex items-center gap-3 px-4 py-3">
            {!c.priority_pending && <TierBadge tier={c.tier} />}
            <Link href={`/admin/member/${c.owner_id}`} className="text-sm font-semibold text-brand">{c.owner_name} →</Link>
          </div>
          {facts.map(([k, v]) => (
            <div key={k} className="flex gap-3 px-4 py-2.5 text-sm">
              <span className="w-28 shrink-0 text-muted">{k}</span>
              <span className="min-w-0 flex-1 break-words">{v}</span>
            </div>
          ))}
          {c.notes && <div className="px-4 py-2.5 text-sm"><span className="text-muted">Notes</span><p className="whitespace-pre-wrap">{c.notes}</p></div>}
        </section>

        <FlagForm memberId={c.owner_id} clientId={c.id} label="Flag this client" />
        {(flags ?? []).length > 0 && (
          <section className="space-y-2">
            <h2 className="px-1 text-sm font-bold">Flags</h2>
            {((flags ?? []) as FlagItem[]).map((f) => <FlagCard key={f.id} flag={f} canReopen />)}
          </section>
        )}

        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">History</h2>
          {history.length === 0 ? (
            <p className="card p-4 text-sm text-muted">Nothing logged yet.</p>
          ) : (
            <ol className="card divide-y divide-line">
              {history.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-3 text-sm">
                  <span className="mt-0.5 text-muted"><TypeIcon type={a.type} /></span>
                  <div className="min-w-0 flex-1">
                    <p><span className="font-semibold">{TYPE_NAMES[a.type]}</span> · {outcomeLabel(a.type, a.outcome)}</p>
                    {a.notes && <p className="whitespace-pre-wrap text-muted">{a.notes}</p>}
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
