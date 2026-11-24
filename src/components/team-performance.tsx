import { relativeDays } from "@/lib/dates";
import { Empty, TypeIcon } from "./ui";

export interface MemberStats {
  member_id: string;
  member_name: string;
  role: string;
  clients_total: number;
  clients_top: number;
  need_priority: number;
  pending_requests: number;
  untouched: number;
  visits: number;
  calls: number;
  texts: number;
  converted: number;
  new_clients: number;
  days_planned: number;
  items_planned: number;
  items_done: number;
  last_active: string | null;
  target_visits: number;
  target_calls: number;
  target_texts: number;
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${max > 0 && value >= max ? "bg-green-600" : "bg-brand"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Metric({ type, label, value, target }: { type: "visit" | "call" | "text"; label: string; value: number; target: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted"><TypeIcon type={type} size={12} /> {label}</span>
        <span className="tabular-nums"><b>{value}</b><span className="text-muted">/{target}</span></span>
      </div>
      <Bar value={value} max={target} />
    </div>
  );
}

/** Admin: one card per salesperson for the chosen week. Targets = daily target × working days. */
export function TeamPerformance({ members, workingDays, today }: { members: MemberStats[]; workingDays: number; today: string }) {
  if (!members.length) return <Empty title="No team members yet" />;

  const sum = (k: keyof MemberStats) => members.reduce((s, m) => s + (Number(m[k]) || 0), 0);
  const planned = sum("items_planned"), done = sum("items_done");

  return (
    <div className="space-y-5">
      <section className="card grid grid-cols-4 divide-x divide-line text-center">
        {[
          { label: "Meetings", value: sum("visits") },
          { label: "Calls", value: sum("calls") },
          { label: "Texts", value: sum("texts") },
          { label: "Plan done", value: planned ? `${Math.round((done / planned) * 100)}%` : "—" },
        ].map((s) => (
          <div key={s.label} className="px-2 py-3">
            <p className="text-lg font-bold tabular-nums">{s.value}</p>
            <p className="text-[11px] text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <ul className="space-y-3">
        {members.map((m) => {
          const completion = m.items_planned ? Math.round((m.items_done / m.items_planned) * 100) : null;
          const flags = [
            m.pending_requests && `${m.pending_requests} awaiting approval`,
            m.need_priority && `${m.need_priority} need priority`,
          ].filter(Boolean);
          return (
            <li key={m.member_id} className="card space-y-3 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-semibold">{m.member_name}{m.role === "admin" && <span className="ml-1.5 text-xs font-medium text-muted">admin</span>}</p>
                <p className="shrink-0 text-xs text-muted">active {relativeDays(m.last_active, today)}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Metric type="visit" label="Meet" value={m.visits} target={m.target_visits * workingDays} />
                <Metric type="call" label="Call" value={m.calls} target={m.target_calls * workingDays} />
                <Metric type="text" label="Text" value={m.texts} target={m.target_texts * workingDays} />
              </div>

              <p className="text-xs text-muted">
                Plan {completion == null ? "not used" : `${completion}% done (${m.items_done} of ${m.items_planned})`}
                {m.days_planned > 0 && ` · ${m.days_planned} day${m.days_planned === 1 ? "" : "s"} planned`}
                {m.converted > 0 && ` · ${m.converted} got business`}
                {m.new_clients > 0 && ` · ${m.new_clients} new clients`}
              </p>

              <div className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <div><p className="font-semibold tabular-nums">{m.clients_total}</p><p className="text-[11px] text-muted">Clients</p></div>
                <div><p className="font-semibold tabular-nums">{m.clients_top}</p><p className="text-[11px] text-muted">Top priority</p></div>
                <div><p className={`font-semibold tabular-nums ${m.untouched ? "text-red-700" : ""}`}>{m.untouched}</p><p className="text-[11px] text-muted">Untouched</p></div>
              </div>
              {flags.length > 0 && <p className="text-xs font-medium text-amber-800">{flags.join(" · ")}</p>}
            </li>
          );
        })}
      </ul>
      <p className="text-center text-xs text-muted">Weekly target = daily target × {workingDays} working days.</p>
    </div>
  );
}
