import Link from "next/link";
import { Plus, Search, Upload } from "lucide-react";
import { getSession } from "@/lib/data";
import { addDays, relativeDays, todayIST } from "@/lib/dates";
import { ChevronRight, Clock } from "lucide-react";
import type { Client } from "@/lib/types";
import { Empty, PageHeader, TierBadge, TierLegend, tierStripe } from "@/components/ui";

const FILTERS = [
  { key: "", label: "All" },
  { key: "due", label: "Due now" },
  { key: "A", label: "Tier A" },
  { key: "B", label: "Tier B" },
  { key: "C", label: "Tier C" },
  { key: "prospect", label: "Prospects" },
];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q = "", f = "" } = await searchParams;
  const { supabase } = await getSession();
  const today = todayIST();

  let query = supabase
    .from("clients")
    .select("id, company, contact_person, area, tier, status, value_score, next_due_date, last_contact_date, last_meeting_date, total_shipments", { count: "exact" })
    .order("tier")
    .order("value_score", { ascending: false })
    .limit(200);

  const term = q.trim().replace(/[,%()*]/g, " ").slice(0, 60);
  if (term) query = query.or(`company.ilike.%${term}%,contact_person.ilike.%${term}%,area.ilike.%${term}%,phone.ilike.%${term}%`);
  if (f === "due") query = query.lte("next_due_date", today).neq("status", "lost");
  else if (f === "prospect") query = query.eq("status", "prospect");
  else if (["A", "B", "C"].includes(f)) query = query.eq("tier", f);

  const { profile } = await getSession();
  const [{ data, count }, { count: untouched }] = await Promise.all([
    query,
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .neq("status", "lost")
      .or(`last_touch_date.is.null,last_touch_date.lt.${addDays(today, -(profile.stagnant_after_days ?? 60))}`),
  ]);
  const clients = (data ?? []) as Client[];

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${count ?? 0} ${f || term ? "matching" : "in your list"}`}
        action={
          <div className="flex gap-2">
            <Link href="/settings/import" className="btn-secondary min-h-10 px-3 text-xs" aria-label="Upload more clients"><Upload size={16} /> Upload</Link>
            <Link href="/clients/new" className="btn-primary min-h-10 px-3" aria-label="Add client"><Plus size={18} /></Link>
          </div>
        }
      />
      <div className="space-y-3 p-4">
        {(untouched ?? 0) > 0 && (
          <Link href="/clients/untouched" className="card flex min-h-16 items-center gap-3 border-red-200 bg-red-50 px-4 py-3 text-red-800">
            <Clock size={20} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{untouched} untouched clients</span>
              <span className="block truncate text-xs text-red-700">No contact in {profile.stagnant_after_days ?? 60}+ days</span>
            </span>
            <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold">
              View <ChevronRight size={16} />
            </span>
          </Link>
        )}
        <form className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="Search company, person, area, phone" />
          {f && <input type="hidden" name="f" value={f} />}
        </form>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((x) => (
            <Link key={x.key} href={`/clients?${new URLSearchParams({ ...(q && { q }), ...(x.key && { f: x.key }) })}`} className="chip shrink-0" data-on={f === x.key}>
              {x.label}
            </Link>
          ))}
        </div>
        <TierLegend />

        {clients.length === 0 ? (
          <Empty title="No clients found">{term || f ? "Try a different search or filter." : "Upload your master list from the Me tab or add a client."}</Empty>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {clients.map((c) => {
              const due = c.next_due_date && c.next_due_date <= today && c.status !== "lost";
              const last = [c.last_contact_date, c.last_meeting_date].filter(Boolean).sort().pop() ?? null;
              return (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className={`flex items-center gap-3 px-3 py-3 active:bg-bg ${tierStripe(c.tier)}`}>
                    <TierBadge tier={c.tier} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.company}</p>
                      <p className="truncate text-xs text-muted">
                        {[c.area, c.status === "prospect" ? "Prospect" : `${c.total_shipments} shipments`, `contact ${relativeDays(last, today)}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {due && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Due</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {(count ?? 0) > clients.length && <p className="text-center text-xs text-muted">Showing {clients.length} of {count}. Search to narrow down.</p>}
      </div>
    </>
  );
}
