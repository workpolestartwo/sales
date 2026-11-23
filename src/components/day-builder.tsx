"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, History, Plus } from "lucide-react";
import { AreaPicker } from "./area-picker";
import { confirmPlan } from "@/app/actions/plan";
import type { ClientOption } from "@/lib/data";
import type { DaySummary } from "@/lib/reports";
import type { Suggestion, SuggestionResult } from "@/lib/suggestions";
import type { ActivityType, Profile } from "@/lib/types";
import { ClientPicker } from "./client-picker";
import { Sheet, TYPE_NAMES } from "./log-sheet";
import { Empty, Meter, TierBadge, TierLegend, TypeIcon, tierStripe } from "./ui";

type Row = Omit<Suggestion, "source"> & { source: Suggestion["source"] | "manual"; selected: boolean };
const NEXT_TYPE: Record<ActivityType, ActivityType> = { visit: "call", call: "text", text: "visit" };

export function DayBuilder({
  profile,
  result,
  yesterday,
  options,
}: {
  profile: Profile;
  result: SuggestionResult;
  yesterday: DaySummary | null;
  options: ClientOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => result.suggestions.map((s) => ({ ...s, selected: s.recommended })));
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<ActivityType>("call");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(() => {
    const c = { visit: 0, call: 0, text: 0 };
    for (const r of rows) if (r.selected) c[r.type]++;
    return c;
  }, [rows]);
  const total = counts.visit + counts.call + counts.text;

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.clientId === id ? { ...r, ...patch } : r)));

  function addClient(c: ClientOption) {
    setRows((rs) => [
      { clientId: c.id, company: c.company, contactPerson: c.contact_person, phone: c.phone, area: c.area, tier: c.tier, type: addType, reason: "Added by you", source: "manual", missCount: 0, recommended: true, selected: true },
      ...rs.filter((r) => r.clientId !== c.id),
    ]);
    setAdding(false);
  }

  function chooseArea(area: string) {
    router.replace(`/today?area=${encodeURIComponent(area)}`);
  }

  function confirm() {
    setError(null);
    start(async () => {
      const res = await confirmPlan({
        focusArea: result.focusArea,
        items: rows.filter((r) => r.selected).map((r) => ({
          clientId: r.clientId,
          type: r.type,
          reason: r.reason,
          source: r.source,
        })),
      });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const backlog = rows.filter((r) => r.source === "backlog");
  const isExtra = (r: Row) => (r.revive || r.nearby) && r.source !== "manual";
  const revive = rows.filter((r) => r.revive && r.source !== "manual");
  const nearby = rows.filter((r) => r.nearby && r.source !== "manual").sort(byDistance);
  const fresh = rows.filter((r) => r.source !== "backlog" && !isExtra(r));
  const visible = (list: Row[]) => (showAll ? list : list.filter((r) => r.selected || r.recommended));
  const hidden = fresh.filter((r) => !r.selected && !r.recommended).length;

  return (
    <div className="space-y-5 p-4 pb-28">
      {yesterday && (
        <div className="card flex items-start gap-3 p-4">
          <History size={18} className="mt-0.5 shrink-0 text-muted" />
          <div className="text-sm">
            <p className="font-semibold">
              Yesterday: {sum(yesterday.done)}/{sum(yesterday.planned)} done
              {yesterday.completion != null && <span className="text-muted"> ({yesterday.completion}%)</span>}
            </p>
            <p className="text-muted">
              {yesterday.missedItems.length > 0 ? `${yesterday.missedItems.length} carried over into today's backlog.` : "Nothing carried over. Nice."}
              {yesterday.unplanned > 0 && ` ${yesterday.unplanned} unplanned ${yesterday.unplanned === 1 ? "activity" : "activities"}.`}
              {yesterday.completion != null && yesterday.completion < 50 && sum(yesterday.planned) > 6 && " Consider a smaller plan you can finish."}
            </p>
          </div>
        </div>
      )}

      <AreaPicker focusArea={result.focusArea} areas={result.areas} options={options} onChoose={chooseArea} />

      <section className="card grid grid-cols-3 gap-4 p-4">
        <Meter label="Meet" value={counts.visit} target={profile.target_visits} />
        <Meter label="Call" value={counts.call} target={profile.target_calls} />
        <Meter label="Text" value={counts.text} target={profile.target_texts} />
      </section>

      {rows.length > 0 && <TierLegend />}

      {rows.length === 0 && (
        <Empty title="No one is due today">Add clients you want to work on, or upload your master list from the Me tab.</Empty>
      )}

      {backlog.length > 0 && (
        <Group title="Backlog" hint="Missed earlier and not contacted since">
          {backlog.map((r) => <SuggestionRow key={r.clientId} row={r} update={update} />)}
        </Group>
      )}

      {(["visit", "call", "text"] as ActivityType[]).map((t) => {
        const list = visible(fresh.filter((r) => r.type === t));
        if (t === "visit") list.sort(byDistance); // nearest first: a sensible order to go round in
        if (list.length === 0) return null;
        return (
          <Group key={t} title={t === "visit" ? `Meet${result.focusArea ? ` in ${result.focusArea}` : ""}` : TYPE_NAMES[t] + "s"}>
            {list.map((r) => <SuggestionRow key={r.clientId} row={r} update={update} />)}
          </Group>
        );
      })}

      {nearby.length > 0 && (
        <Group title={`Also near ${result.focusArea}`} hint="Not due yet, but close by and not visited in 2+ weeks. Tick any you can drop in on.">
          {nearby.map((r) => <SuggestionRow key={r.clientId} row={r} update={update} />)}
        </Group>
      )}

      {revive.length > 0 && (
        <Group title="Revive old clients" hint="Valuable clients nobody has contacted in a long time. Tick a few to bring them back.">
          {revive.map((r) => <SuggestionRow key={r.clientId} row={r} update={update} />)}
        </Group>
      )}
      <Link href="/clients/untouched" className="-mt-2 block px-1 text-xs font-semibold text-brand">See all untouched clients →</Link>

      <div className="flex gap-2">
        {hidden > 0 && (
          <button className="btn-secondary flex-1" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show recommended only" : `Show ${hidden} more due`}
          </button>
        )}
        <button className="btn-secondary flex-1" onClick={() => setAdding(true)}><Plus size={16} /> Add a client</button>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={pending || total === 0} onClick={confirm}>
            <Check size={18} /> {pending ? "Saving…" : `Confirm plan · ${total} ${total === 1 ? "client" : "clients"}`}
          </button>
        </div>
      </div>

      {adding && (
        <Sheet title="Add to today's plan" onClose={() => setAdding(false)}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(["visit", "call", "text"] as ActivityType[]).map((t) => (
              <button key={t} className="chip justify-center gap-1.5" data-on={addType === t} onClick={() => setAddType(t)}>
                <TypeIcon type={t} /> {TYPE_NAMES[t]}
              </button>
            ))}
          </div>
          <ClientPicker options={options} onPick={addClient} exclude={rows.filter((r) => r.selected).map((r) => r.clientId)} area={addType === "visit" ? result.focusArea : null} />
        </Sheet>
      )}
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-sm font-bold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <ul className="card divide-y divide-line overflow-hidden">{children}</ul>
    </section>
  );
}

function SuggestionRow({ row, update }: { row: Row; update: (id: string, patch: Partial<Row>) => void }) {
  return (
    <li className={`flex items-center gap-3 px-3 py-3 ${tierStripe(row.tier)} ${row.selected ? "" : "opacity-55"}`}>
      <button
        aria-label={row.selected ? "Remove from plan" : "Add to plan"}
        onClick={() => update(row.clientId, { selected: !row.selected })}
        className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 ${row.selected ? "border-brand bg-brand text-brand-ink" : "border-line"}`}
      >
        {row.selected && <Check size={16} strokeWidth={3} />}
      </button>
      <TierBadge tier={row.tier} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{row.company}</p>
        <p className={`truncate text-xs ${row.missCount >= 2 ? "font-medium text-red-600" : "text-muted"}`}>
          {row.area ? `${row.area} · ` : ""}{row.reason}
        </p>
      </div>
      <button
        onClick={() => update(row.clientId, { type: NEXT_TYPE[row.type] })}
        className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-line px-2 text-xs font-semibold"
        aria-label={`Change to ${TYPE_NAMES[NEXT_TYPE[row.type]]}`}
      >
        <TypeIcon type={row.type} size={14} /> {TYPE_NAMES[row.type]}
      </button>
    </li>
  );
}

function byDistance(a: { distanceKm?: number }, b: { distanceKm?: number }) {
  return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
}

function sum(c: Record<ActivityType, number>) {
  return c.visit + c.call + c.text;
}
