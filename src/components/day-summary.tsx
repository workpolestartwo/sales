import type { DaySummary } from "@/lib/reports";
import type { ActivityType, Profile } from "@/lib/types";
import { OUTCOME_LABELS, type Outcome } from "@/lib/types";
import { TierBadge, TypeIcon } from "./ui";

const ACTIVITIES: { type: ActivityType; label: string; target: "target_visits" | "target_calls" | "target_texts" }[] = [
  { type: "visit", label: "Meetings", target: "target_visits" },
  { type: "call", label: "Calls", target: "target_calls" },
  { type: "text", label: "Texts", target: "target_texts" },
];

const total = (c: Record<ActivityType, number>) => c.visit + c.call + c.text;

function dayStatus(s: DaySummary) {
  if (!s.hasPlan) return "No plan made";
  if (s.planStatus === "closed") return s.autoClosed ? "Closed automatically" : "Day closed";
  return "In progress";
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${max > 0 && value >= max ? "bg-green-600" : "bg-brand"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold">{title}</h2>
      <div className="card divide-y divide-line overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm">
      <span className="min-w-0 truncate text-muted">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Plan vs actual for one day. Used on Today (after closing) and in Reports. */
export function DaySummaryCard({ summary: s, profile }: { summary: DaySummary; profile: Profile }) {
  const planned = total(s.planned);
  const done = total(s.done);
  const outcomes = Object.entries(s.outcomes) as [Outcome, number][];

  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Plan completed</p>
            <p className="text-3xl font-bold tabular-nums">{s.completion == null ? "—" : `${s.completion}%`}</p>
          </div>
          <p className="pb-1 text-sm font-semibold tabular-nums">{done} of {planned} done</p>
        </div>
        <Bar value={done} max={planned} />
        <p className="text-xs text-muted">{[dayStatus(s), s.focusArea].filter(Boolean).join(" · ")}</p>
      </section>

      <Section title="Daily targets">
        {ACTIVITIES.map((a) => (
          <div key={a.type} className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium"><TypeIcon type={a.type} size={15} /> {a.label}</span>
              <span className="tabular-nums"><b>{s.actual[a.type]}</b><span className="text-muted"> / {profile[a.target]}</span></span>
            </div>
            <Bar value={s.actual[a.type]} max={profile[a.target]} />
            <p className="text-xs text-muted tabular-nums">{s.done[a.type]} of {s.planned[a.type]} planned done</p>
          </div>
        ))}
      </Section>

      <Section title="Day at a glance">
        <Row label="Unplanned activities" value={s.unplanned} />
        <Row label="New clients added" value={s.newClients} />
        <Row label="Follow-ups set" value={s.followUpsSet} />
      </Section>

      {s.fieldVisits.length > 0 && (
        <Section title="Field visits">
          {s.fieldVisits.map((v, i) => (
            <Row key={i} label={v.area} value={`${v.met} met · ${v.newOffices} new`} />
          ))}
        </Section>
      )}

      {outcomes.length > 0 && (
        <Section title="Outcomes">
          {outcomes.map(([o, n]) => <Row key={o} label={OUTCOME_LABELS[o]} value={n} />)}
        </Section>
      )}

      {s.missedItems.length > 0 && (
        <Section title={`${s.planStatus === "closed" ? "Missed" : "Still to do"} · ${s.missedItems.length}`}>
          {s.missedItems.map((m, i) => (
            <div key={i} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
              <TierBadge tier={m.tier} />
              <span className="min-w-0 flex-1 truncate">{m.company}</span>
              <span className="text-muted"><TypeIcon type={m.type} size={15} /></span>
            </div>
          ))}
        </Section>
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
