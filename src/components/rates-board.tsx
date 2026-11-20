"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search, Trash2 } from "lucide-react";
import { deleteRate, saveRate } from "@/app/actions/rates";
import { addDays, formatDate } from "@/lib/dates";
import {
  COMMON_PORTS, CONTAINER_LABELS, CONTAINER_TYPES, UNIT, money, profit, suggestedQuote, validity,
  type ContainerType, type Currency, type Direction, type Rate, type RateSettings, type Validity,
} from "@/lib/rates";
import { Sheet } from "./log-sheet";
import { Empty } from "./ui";

type Filter = "all" | Direction;

const VALIDITY_STYLE: Record<Validity, string> = {
  valid: "bg-green-100 text-green-800",
  expiring: "bg-yellow-100 text-yellow-900",
  expired: "bg-red-100 text-red-700",
};

export function RatesBoard({ rates, settings, today, userId }: { rates: Rate[]; settings: RateSettings; today: string; userId: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [showExpired, setShowExpired] = useState(false);
  const [open, setOpen] = useState<Rate | null>(null);
  const [editing, setEditing] = useState<Partial<Rate> | null>(null);

  const expiredCount = rates.filter((r) => validity(r.valid_until, today) === "expired").length;

  const lanes = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rates.filter(
      (r) =>
        (filter === "all" || r.direction === filter) &&
        (showExpired || validity(r.valid_until, today) !== "expired") &&
        (!needle || r.origin.toLowerCase().includes(needle) || r.destination.toLowerCase().includes(needle)),
    );
    const map = new Map<string, Rate[]>();
    for (const r of list) {
      const key = `${r.origin.toLowerCase()}|${r.destination.toLowerCase()}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.values()].map((rs) => rs.sort((a, b) => CONTAINER_TYPES.indexOf(a.container_type) - CONTAINER_TYPES.indexOf(b.container_type)));
  }, [rates, filter, q, showExpired, today]);

  return (
    <div className="space-y-4 p-4">
      <div className="relative">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a port, e.g. Jebel Ali" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "export", "import"] as Filter[]).map((f) => (
          <button key={f} className="chip capitalize" data-on={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f}</button>
        ))}
        {expiredCount > 0 && (
          <button className="chip ml-auto" data-on={showExpired} onClick={() => setShowExpired((v) => !v)}>
            {showExpired ? "Hide" : "Show"} expired · {expiredCount}
          </button>
        )}
      </div>

      <button className="btn-primary w-full" onClick={() => setEditing({ direction: filter === "import" ? "import" : "export" })}>
        <Plus size={16} /> Add or update a rate
      </button>

      {lanes.length === 0 ? (
        <Empty title={rates.length ? "No rates match" : "No rates yet"}>
          {rates.length ? "Try another port or show expired rates." : "Got a rate from an agent or co-loader? Add it so the whole team can quote from it."}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {lanes.map((rs) => (
            <li key={`${rs[0].origin}|${rs[0].destination}`} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <span className="truncate font-semibold">{rs[0].origin}</span>
                <ArrowRight size={14} className="shrink-0 text-muted" />
                <span className="truncate font-semibold">{rs[0].destination}</span>
                <span className="ml-auto shrink-0 rounded-full bg-bg px-2 py-0.5 text-[11px] font-semibold text-muted uppercase">{rs[0].direction}</span>
              </div>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-[11px] text-muted">
                    <th className="px-4 pt-2 text-left font-medium" />
                    <th className="px-2 pt-2 text-right font-medium">Buy</th>
                    <th className="px-2 pt-2 text-right font-medium">Quote</th>
                    <th className="px-4 pt-2 text-right font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {rs.map((r) => {
                    const quote = suggestedQuote(r.buy_rate, settings.markup_pct);
                    const v = validity(r.valid_until, today);
                    return (
                      <tr key={r.id} onClick={() => setOpen(r)} className={`cursor-pointer active:bg-bg ${v === "expired" ? "opacity-50" : ""}`}>
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{CONTAINER_LABELS[r.container_type]}</span>
                          {r.container_type === "LCL" && <span className="text-[11px] text-muted"> /CBM</span>}
                        </td>
                        <td className="px-2 py-2.5 text-right">{money(r.buy_rate, r.currency)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold">{money(quote, r.currency)}</td>
                        <td className="px-4 py-2.5 text-right text-green-700">+{money(quote - r.buy_rate, r.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <LaneFooter rates={rs} today={today} />
            </li>
          ))}
        </ul>
      )}

      {open && (
        <RateSheet
          rate={open}
          settings={settings}
          today={today}
          canDelete={open.updated_by === userId}
          onClose={() => setOpen(null)}
          onUpdate={() => { setEditing(open); setOpen(null); }}
        />
      )}
      {editing && <RateForm initial={editing} settings={settings} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** "Updated 2d ago by Ramesh · valid till 26 Nov" for the most recently updated rate on the lane. */
function LaneFooter({ rates, today }: { rates: Rate[]; today: string }) {
  const latest = [...rates].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const worst = rates.map((r) => validity(r.valid_until, today)).sort((a, b) => ["expired", "expiring", "valid"].indexOf(a) - ["expired", "expiring", "valid"].indexOf(b))[0];
  const soonest = rates.map((r) => r.valid_until).sort()[0];
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-bg/60 px-4 py-2 text-[11px] text-muted">
      <span>Updated {ago(latest.updated_at)} by <span className="font-semibold text-ink">{latest.updated_by_name ?? "someone"}</span></span>
      <span className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${VALIDITY_STYLE[worst]}`}>
        {worst === "expired" ? "Expired, needs update" : `Valid till ${formatDate(soonest)}`}
      </span>
    </div>
  );
}

function ago(ts: string): string {
  const mins = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/* ------------------------------------------------------------------ Rate detail + calculator */

function RateSheet({ rate: r, settings, today, canDelete, onClose, onUpdate }: {
  rate: Rate; settings: RateSettings; today: string; canDelete: boolean; onClose: () => void; onUpdate: () => void;
}) {
  const router = useRouter();
  const suggested = suggestedQuote(r.buy_rate, settings.markup_pct);
  const [quote, setQuote] = useState(String(suggested));
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const qn = Number(quote) || 0;
  const n = Math.max(0, Number(qty) || 0);
  const p = profit(r.buy_rate, qn);
  const v = validity(r.valid_until, today);
  const unit = UNIT[r.container_type];

  return (
    <Sheet title={`${r.origin} → ${r.destination}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip">{CONTAINER_LABELS[r.container_type]}</span>
          <span className="chip capitalize">{r.direction}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VALIDITY_STYLE[v]}`}>
            {v === "expired" ? `Expired ${formatDate(r.valid_until)}` : `Valid till ${formatDate(r.valid_until)}`}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-bg p-3">
            <p className="text-xs text-muted">Buy rate</p>
            <p className="text-xl font-bold tabular-nums">{money(r.buy_rate, r.currency)}<span className="text-xs font-normal text-muted"> /{unit}</span></p>
          </div>
          <div className="rounded-xl bg-bg p-3">
            <p className="text-xs text-muted">Suggested quote (+{settings.markup_pct}%)</p>
            <p className="text-xl font-bold tabular-nums">{money(suggested, r.currency)}<span className="text-xs font-normal text-muted"> /{unit}</span></p>
          </div>
        </div>

        <div className="card space-y-3 p-4">
          <p className="text-sm font-semibold">What if I quote…</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Quote per {unit} ({r.currency})</span>
              <input className="input text-lg font-semibold" inputMode="decimal" value={quote} onChange={(e) => setQuote(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{r.container_type === "LCL" ? "CBM" : "Containers"}</span>
              <input className="input text-lg font-semibold" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
          </div>
          <div className={`rounded-xl p-3 ${p.perUnit < 0 ? "bg-red-50 text-red-800" : "bg-green-50 text-green-900"}`}>
            <p className="text-2xl font-bold tabular-nums">
              {p.perUnit < 0 ? "−" : "+"}{money(Math.abs(p.perUnit * n), r.currency)}
            </p>
            <p className="text-xs">
              {p.perUnit < 0 ? "Loss" : "Profit"} on {n} {unit}{n === 1 ? "" : "s"} · {money(Math.abs(p.perUnit), r.currency)} per {unit} · {p.markupPct.toFixed(1)}% over buy
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15, 20].map((pct) => (
              <button key={pct} className="chip min-h-8 px-2.5 text-xs" data-on={Number(quote) === suggestedQuote(r.buy_rate, pct)} onClick={() => setQuote(String(suggestedQuote(r.buy_rate, pct)))}>
                +{pct}%
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 text-sm">
          {r.source && <p><span className="text-muted">Source:</span> {r.source}</p>}
          {r.notes && <p className="whitespace-pre-wrap"><span className="text-muted">Notes:</span> {r.notes}</p>}
          <p className="text-xs text-muted">Last updated {ago(r.updated_at)} by {r.updated_by_name ?? "someone"}</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {canDelete && (
            <button
              className="btn-ghost text-red-600"
              disabled={pending}
              onClick={() => confirm("Delete this rate for everyone?") && start(async () => {
                const res = await deleteRate(r.id);
                if (res.error) return setError(res.error);
                onClose();
                router.refresh();
              })}
              aria-label="Delete rate"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button className="btn-primary flex-1" onClick={onUpdate}>Update this rate</button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Add / update form */

function RateForm({ initial, settings, today, onClose }: { initial: Partial<Rate>; settings: RateSettings; today: string; onClose: () => void }) {
  const router = useRouter();
  const isUpdate = Boolean(initial.id);
  const [f, setF] = useState({
    direction: (initial.direction ?? "export") as Direction,
    origin: initial.origin ?? (initial.direction === "import" ? "" : "Nhava Sheva"),
    destination: initial.destination ?? (initial.direction === "import" ? "Nhava Sheva" : ""),
    containerType: (initial.container_type ?? "20GP") as ContainerType,
    buyRate: initial.buy_rate != null ? String(initial.buy_rate) : "",
    currency: (initial.currency ?? "USD") as Currency,
    // A fresh quote from an agent is valid for about a week from today.
    validUntil: addDays(today, settings.rate_valid_days),
    source: initial.source ?? "",
    notes: initial.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const buy = Number(f.buyRate);
  const quote = Number.isFinite(buy) && buy > 0 ? suggestedQuote(buy, settings.markup_pct) : null;

  function save() {
    setError(null);
    start(async () => {
      const res = await saveRate(f);
      if (res.error) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet title={isUpdate ? "Update rate" : "Add or update a rate"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["export", "import"] as Direction[]).map((d) => (
            <button key={d} className="chip justify-center capitalize" data-on={f.direction === d} disabled={isUpdate} onClick={() => set("direction", d)}>{d}</button>
          ))}
        </div>

        <datalist id="ports">{COMMON_PORTS.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">From</span>
            <input className="input" list="ports" value={f.origin} disabled={isUpdate} onChange={(e) => set("origin", e.target.value)} placeholder="Origin port" />
          </label>
          <label className="block">
            <span className="label">To</span>
            <input className="input" list="ports" value={f.destination} disabled={isUpdate} onChange={(e) => set("destination", e.target.value)} placeholder="Destination port" />
          </label>
        </div>

        <div>
          <span className="label">Container</span>
          <div className="grid grid-cols-4 gap-1.5">
            {CONTAINER_TYPES.map((t) => (
              <button key={t} className="chip justify-center px-1 text-xs" data-on={f.containerType === t} disabled={isUpdate} onClick={() => set("containerType", t)}>
                {t === "LCL" ? "LCL" : CONTAINER_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label className="block">
            <span className="label">Buy rate {f.containerType === "LCL" ? "per CBM" : "per container"}</span>
            <input className="input text-lg font-semibold" inputMode="decimal" value={f.buyRate} onChange={(e) => set("buyRate", e.target.value)} placeholder="0" autoFocus={isUpdate} />
          </label>
          <label className="block">
            <span className="label">Currency</span>
            <select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
              <option>USD</option><option>INR</option><option>EUR</option>
            </select>
          </label>
        </div>
        {quote != null && (
          <p className="-mt-2 text-sm text-muted">
            Suggested quote <span className="font-semibold text-ink">{money(quote, f.currency)}</span> · profit <span className="font-semibold text-green-700">{money(quote - buy, f.currency)}</span>
          </p>
        )}

        <label className="block">
          <span className="label">Valid until</span>
          <input type="date" className="input" min={today} value={f.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
        </label>
        <input className="input" value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="Agent / co-loader (optional)" />
        <textarea className="input py-2" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes: transit time, free days, surcharges… (optional)" />

        {!isUpdate && <p className="text-xs text-muted">If this lane and container already has a rate, it will be replaced.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save rate for the team"}</button>
      </div>
    </Sheet>
  );
}
