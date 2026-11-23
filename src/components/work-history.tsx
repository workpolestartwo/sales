import Link from "next/link";
import { addDays, formatDate } from "@/lib/dates";
import { TYPE_NAMES, outcomeLabel, type ActivityType, type Outcome } from "@/lib/types";
import { Empty, TypeIcon } from "./ui";

export interface HistoryEntry {
  id: string;
  type: ActivityType;
  activity_date: string;
  outcome: Outcome;
  notes: string | null;
  follow_up_date: string | null;
  is_cold: boolean;
  plan_item_id: string | null;
  created_at: string;
  client_id: string | null;
  field_visit_id: string | null;
  clients: { company: string; area: string | null } | null;
  field_visits: { area: string; notes: string | null } | null;
}

const istDate = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ts));
const istTime = (ts: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ts));

function dayTitle(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function dayCounts(entries: HistoryEntry[]) {
  const n = (t: ActivityType) => entries.filter((e) => e.type === t).length;
  const part = (count: number, word: string) => (count ? `${count} ${word}${count === 1 ? "" : "s"}` : null);
  return [part(n("visit"), "meeting"), part(n("call"), "call"), part(n("text"), "text")].filter(Boolean).join(" · ");
}

/** Everything the member logged, newest first, grouped by day. */
export function WorkHistory({ entries, today }: { entries: HistoryEntry[]; today: string }) {
  if (entries.length === 0) return <Empty title="Nothing here yet">Meetings, calls and texts you log will appear here.</Empty>;

  const days = new Map<string, HistoryEntry[]>();
  for (const e of entries) days.set(e.activity_date, [...(days.get(e.activity_date) ?? []), e]);
  // A note for the whole trip is shown once, on the first entry of that visit.
  const visitNoteShown = new Set<string>();

  return (
    <div className="space-y-5">
      {[...days].map(([date, list]) => (
        <section key={date}>
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-sm font-bold">{dayTitle(date, today)}</h2>
            <p className="text-xs text-muted">{dayCounts(list)}</p>
          </div>
          <ol className="card divide-y divide-line overflow-hidden">
            {list.map((e) => {
              const area = e.field_visits?.area ?? e.clients?.area;
              // Logs synced after being made offline don't have a reliable time of day.
              const time = istDate(e.created_at) === e.activity_date ? istTime(e.created_at) : null;
              const visitNote = e.field_visit_id && e.field_visits?.notes && !visitNoteShown.has(e.field_visit_id) ? e.field_visits.notes : null;
              if (visitNote) visitNoteShown.add(e.field_visit_id!);
              const body = (
                <>
                  <span className="mt-0.5 shrink-0 text-muted"><TypeIcon type={e.type} size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-semibold">{e.clients?.company ?? "Client removed"}</span>
                      {time && <span className="shrink-0 text-xs text-muted">{time}</span>}
                    </span>
                    <span className="block text-xs text-muted">
                      {[TYPE_NAMES[e.type], outcomeLabel(e.type, e.outcome), area, e.is_cold ? "Cold" : null, e.plan_item_id ? null : "Unplanned"].filter(Boolean).join(" · ")}
                    </span>
                    {e.notes && <span className="mt-1 block text-sm break-words whitespace-pre-wrap">{e.notes}</span>}
                    {visitNote && <span className="mt-1 block text-sm break-words whitespace-pre-wrap"><span className="text-muted">Visit note: </span>{visitNote}</span>}
                    {e.follow_up_date && <span className="mt-1 block text-xs font-medium text-brand">Follow-up {formatDate(e.follow_up_date)}</span>}
                  </span>
                </>
              );
              return (
                <li key={e.id}>
                  {e.client_id
                    ? <Link href={`/clients/${e.client_id}`} className="flex gap-3 px-4 py-3 active:bg-bg">{body}</Link>
                    : <div className="flex gap-3 px-4 py-3">{body}</div>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
