import Link from "next/link";
import { getSession } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { WorkHistory, type HistoryEntry } from "@/components/work-history";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "visit", label: "Meetings" },
  { key: "call", label: "Calls" },
  { key: "text", label: "Texts" },
];
const PAGE = 100;

export default async function WorkHistoryPage({ searchParams }: { searchParams: Promise<{ type?: string; n?: string }> }) {
  const sp = await searchParams;
  const type = FILTERS.some((f) => f.key === sp.type) ? sp.type! : "";
  const limit = Math.min(2000, Math.max(PAGE, Number(sp.n) || PAGE));
  const { supabase } = await getSession();

  let query = supabase
    .from("activities")
    .select("id, type, activity_date, outcome, notes, follow_up_date, is_cold, plan_item_id, created_at, client_id, field_visit_id, clients(company, area), field_visits(area, notes)")
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  const rows = (data ?? []) as unknown as HistoryEntry[];
  const href = (t: string, n?: number) => `/settings/history?${new URLSearchParams({ ...(t && { type: t }), ...(n && { n: String(n) }) })}`;

  return (
    <>
      <PageHeader back="/settings" title="Work history" subtitle="What you did and when" />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-line/60 p-1">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} className={`flex min-h-10 items-center justify-center rounded-lg text-xs font-semibold ${type === f.key ? "bg-surface shadow-sm" : "text-muted"}`}>
              {f.label}
            </Link>
          ))}
        </div>
        {error ? <p className="text-sm text-red-600">Couldn&apos;t load your history. Please try again.</p> : <WorkHistory entries={rows.slice(0, limit)} today={todayIST()} />}
        {rows.length > limit && limit < 2000 && (
          <Link href={href(type, limit + PAGE)} scroll={false} className="btn-secondary w-full">Show older</Link>
        )}
      </div>
    </>
  );
}
