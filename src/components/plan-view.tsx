"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MapPin, MessageCircle, Moon, Phone, Plus, Undo2, X } from "lucide-react";
import { areaDistance, mapsLink } from "@/lib/areas";
import { addPlanItem, closeDay, setItemDropped } from "@/app/actions/plan";
import type { ClientOption } from "@/lib/data";
import type { ActivityType, PlanItem, Profile } from "@/lib/types";
import { OUTCOME_LABELS, type Outcome } from "@/lib/types";
import { ClientPicker } from "./client-picker";
import { LogSheet, Sheet, TYPE_NAMES, type LogTarget } from "./log-sheet";
import { Meter, TierBadge, TypeIcon, telHref, tierStripe } from "./ui";
import { WhatsAppSheet, type WaTarget } from "./whatsapp-sheet";

interface Unplanned { id: string; type: ActivityType; outcome: string; clients: { company: string } | null }

export function PlanView({
  today,
  focusArea,
  profile,
  items,
  unplanned,
  actual,
  options,
}: {
  today: string;
  focusArea: string | null;
  profile: Profile;
  items: PlanItem[];
  unplanned: Unplanned[];
  actual: Record<ActivityType, number>;
  options: ClientOption[];
}) {
  const router = useRouter();
  const [logging, setLogging] = useState<LogTarget | null>(null);
  const [wa, setWa] = useState<WaTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<ActivityType>("call");
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Visits first, nearest to today's area first (a sensible route), then calls and texts.
  const todo = items
    .filter((i) => i.status === "planned")
    .map((i) => ({ i, d: i.type === "visit" ? areaDistance(focusArea, i.clients?.area) ?? 99 : 999 }))
    .sort((a, b) => a.d - b.d)
    .map(({ i }) => i);
  const done = items.filter((i) => i.status === "done");
  const dropped = items.filter((i) => i.status === "dropped");
  const active = items.length - dropped.length;
  const pct = active ? Math.round((done.length / active) * 100) : 0;
  const evening = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date())) >= 18;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else { setError(null); router.refresh(); }
    });

  return (
    <div className="space-y-5 p-4">
      <section className="card space-y-4 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold tabular-nums">{pct}%</p>
            <p className="text-xs text-muted">{done.length} of {active} planned done{unplanned.length > 0 && ` · ${unplanned.length} unplanned`}</p>
          </div>
          <button className="btn-secondary min-h-9 text-xs" onClick={() => setAdding(true)}><Plus size={14} /> Add</button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Meter label="Met" value={actual.visit} target={profile.target_visits} />
          <Meter label="Called" value={actual.call} target={profile.target_calls} />
          <Meter label="Texted" value={actual.text} target={profile.target_texts} />
        </div>
      </section>

      {evening && todo.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <Moon size={18} className="shrink-0" />
          <p className="flex-1">Wrapping up? Log what you did, then end your day.</p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold">To do · {todo.length}</h2>
        {todo.length === 0 ? (
          <div className="card p-5 text-center text-sm text-muted">Everything planned is done 🎉</div>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {todo.map((i) => {
              const c = i.clients;
              return (
                <li key={i.id} className={`px-3 py-3 ${tierStripe(c?.tier)}`}>
                  <div className="flex items-center gap-3">
                    {c && <TierBadge tier={c.tier} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c?.company ?? "Client"}</p>
                      <p className="truncate text-xs text-muted">
                        <TypeIcon type={i.type} size={11} /> {TYPE_NAMES[i.type]}{c?.area ? ` · ${c.area}` : ""}{i.reason ? ` · ${i.reason}` : ""}
                      </p>
                    </div>
                    <button aria-label="Drop from plan" className="grid size-9 place-items-center rounded-full text-muted" disabled={pending} onClick={() => run(() => setItemDropped(i.id, true))}>
                      <X size={16} />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2 pl-9">
                    {i.type === "visit" && c && (
                      <a href={mapsLink([c.company, c.address, c.area])} target="_blank" rel="noreferrer" className="btn-secondary min-h-9 px-3 text-xs" aria-label="Open in Google Maps">
                        <MapPin size={14} />
                      </a>
                    )}
                    {c?.phone && (
                      <>
                        <a href={telHref(c.phone)} className="btn-secondary min-h-9 flex-1 text-xs"><Phone size={14} /> Call</a>
                        <button onClick={() => setWa({ clientId: c.id, company: c.company, contactPerson: c.contact_person, phone: c.phone, planItemId: i.id })} className="btn-secondary min-h-9 flex-1 text-xs"><MessageCircle size={14} /> WhatsApp</button>
                      </>
                    )}
                    <button className="btn-primary min-h-9 flex-1 text-xs" onClick={() => c && setLogging({ clientId: c.id, company: c.company, type: i.type, planItemId: i.id })}>
                      <CheckCircle2 size={14} /> Log
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">Done · {done.length}</h2>
          <ul className="card divide-y divide-line">
            {done.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
                <span className="min-w-0 flex-1 truncate">{i.clients?.company}</span>
                <TypeIcon type={i.type} size={14} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {unplanned.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold">Unplanned · {unplanned.length}</h2>
          <ul className="card divide-y divide-line">
            {unplanned.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <TypeIcon type={a.type} size={16} />
                <span className="min-w-0 flex-1 truncate">{a.clients?.company ?? "—"}</span>
                <span className="text-xs text-muted">{OUTCOME_LABELS[a.outcome as Outcome] ?? a.outcome}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dropped.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-sm font-bold text-muted">Dropped · {dropped.length}</h2>
          <ul className="card divide-y divide-line">
            {dropped.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
                <span className="min-w-0 flex-1 truncate line-through">{i.clients?.company}</span>
                <button className="btn-ghost min-h-9 px-2 text-xs" disabled={pending} onClick={() => run(() => setItemDropped(i.id, false))}>
                  <Undo2 size={14} /> Undo
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button className="btn-secondary w-full" onClick={() => setConfirmClose(true)}><Moon size={16} /> End my day</button>

      {confirmClose && (
        <Sheet title="End your day?" onClose={() => setConfirmClose(false)}>
          <p className="mb-4 text-sm text-muted">
            {todo.length > 0
              ? `${todo.length} ${todo.length === 1 ? "item is" : "items are"} still open. They'll be marked missed and come up first in tomorrow's plan.`
              : "Everything planned is done. Your daily report will be ready."}
          </p>
          <button className="btn-primary w-full" disabled={pending} onClick={() => run(closeDay)}>
            {pending ? "Closing…" : "End day and see report"}
          </button>
        </Sheet>
      )}

      {adding && (
        <Sheet title="Add to today's plan" onClose={() => setAdding(false)}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {(["visit", "call", "text"] as ActivityType[]).map((t) => (
              <button key={t} className="chip justify-center gap-1.5" data-on={addType === t} onClick={() => setAddType(t)}>
                <TypeIcon type={t} /> {TYPE_NAMES[t]}
              </button>
            ))}
          </div>
          <ClientPicker
            options={options}
            exclude={items.filter((i) => i.status !== "dropped").map((i) => i.client_id!).filter(Boolean)}
            onPick={(c) => { setAdding(false); run(() => addPlanItem({ clientId: c.id, type: addType })); }}
          />
        </Sheet>
      )}

      {logging && <LogSheet target={logging} today={today} onClose={() => setLogging(null)} />}
      {wa && <WhatsAppSheet target={wa} myName={profile.full_name ?? ""} onClose={() => { setWa(null); router.refresh(); }} />}
    </div>
  );
}
