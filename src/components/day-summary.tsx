import type { DaySummary } from "@/lib/reports";
import type { ActivityType, Profile } from "@/lib/types";
import { OUTCOME_LABELS, type Outcome } from "@/lib/types";
import { TierBadge, TypeIcon } from "./ui";

const ROWS: { type: ActivityType; label: string; target: keyof Profile }[] = [
  { type: "visit", label: "Meetings", target: "target_visits" },
  { type: "call", label: "Calls", target: "target_calls" },
  { type: "text", label: "Texts", target: "target_texts" },
];

/** Plan vs actual for one day. Used on Today (after closing) and in Reports. */
export function DaySummaryCard({ summary: s, profile }: { summary: DaySummary; profile: Profile }) {
  const outcomes = Object.entries(s.outcomes) as [Outcome, number][];
  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold tabular-nums">{s.completion ?? 0}%</p>
            <p className="text-xs text-muted">
              {s.hasPlan ? "of the plan completed" : "No plan was made this day"}
              {s.autoClosed && " · closed automatically"}
            </p>
          </div>
          {s.focusArea && <span className="chip">{s.focusArea}</span>}
        </div>

        <table className="mt-4 w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium" />
              <th className="pb-2 text-right font-medium">Planned</th>
              <th className="pb-2 text-right font-medium">Done</th>
              <th className="pb-2 text-right font-medium">Actual</th>
              <th className="pb-2 text-right font-medium">Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ROWS.map((r) => (
              <tr key={r.type}>
                <td className="py-2 font-medium"><span className="inline-flex items-center gap-1.5"><TypeIcon type={r.type} size={14} /> {r.label}</span></td>
                <td className="py-2 text-right">{s.planned[r.type]}</td>
                <td className="py-2 text-right">{s.done[r.type]}</td>
                <td className={`py-2 text-right font-semibold ${s.actual[r.type] >= (profile[r.target] as number) ? "text-emerald-600" : ""}`}>{s.actual[r.type]}</td>
                <td className="py-2 text-right text-muted">{profile[r.target] as number}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Actual includes unplanned work. Done counts only planned items.</p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Stat label="Unplanned" value={s.unplanned} />
        <Stat label="New clients" value={s.newClients} />
        <Stat label="Follow-ups set" value={s.followUpsSet} />
      </section>

      {s.fieldVisits.length > 0 && (
        <section className="card p-4">
          <p className="label">Field visits</p>
          <ul className="space-y-1 text-sm">
            {s.fieldVisits.map((v, i) => (
              <li key={i}><span className="font-semibold">{v.area}</span> <span className="text-muted">· {v.met} clients met · {v.newOffices} new offices</span></li>
            ))}
          </ul>
        </section>
      )}

      {outcomes.length > 0 && (
        <section className="card p-4">
          <p className="label">Outcomes</p>
          <div className="flex flex-wrap gap-2">
            {outcomes.map(([o, n]) => <span key={o} className="chip">{OUTCOME_LABELS[o]} · {n}</span>)}
          </div>
        </section>
      )}

      {s.missedItems.length > 0 && (
        <section className="card p-4">
          <p className="label">Missed ({s.missedItems.length})</p>
          <ul className="space-y-2 text-sm">
            {s.missedItems.map((m, i) => (
              <li key={i} className="flex items-center gap-2"><TierBadge tier={m.tier} /><span className="flex-1 truncate">{m.company}</span><TypeIcon type={m.type} size={14} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
