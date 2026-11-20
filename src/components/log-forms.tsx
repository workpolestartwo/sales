"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2, UserPlus } from "lucide-react";
import { logOrQueue } from "@/lib/offline-queue";
import type { ClientOption } from "@/lib/data";
import type { ActivityType, Outcome } from "@/lib/types";
import { ClientPicker } from "./client-picker";
import { FollowUpPicker, LogSheet, OUTCOMES, Sheet, TYPE_NAMES, type LogTarget } from "./log-sheet";
import { TierBadge, TypeIcon } from "./ui";
import { VoiceTextarea } from "./voice-input";

export function LogForms({ options, areas, today, initialTab }: { options: ClientOption[]; areas: string[]; today: string; initialTab: ActivityType }) {
  const [tab, setTab] = useState<ActivityType>(initialTab);
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-line/60 p-1">
        {(["visit", "call", "text"] as ActivityType[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${tab === t ? "bg-surface shadow-sm" : "text-muted"}`}>
            <TypeIcon type={t} size={15} /> {t === "visit" ? "Field visit" : TYPE_NAMES[t]}
          </button>
        ))}
      </div>
      {tab === "visit" ? <FieldVisitForm options={options} areas={areas} today={today} /> : <QuickLog key={tab} type={tab} options={options} today={today} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Calls / texts */

function QuickLog({ type, options, today }: { type: ActivityType; options: ClientOption[]; today: string }) {
  const [target, setTarget] = useState<LogTarget | null>(null);
  const [cold, setCold] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (cold) return <ColdForm type={type} today={today} onDone={(name) => { setCold(false); setSaved(name); }} onCancel={() => setCold(false)} />;

  return (
    <div className="space-y-3">
      {saved && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Saved {saved}.</p>}
      <button className="btn-secondary w-full" onClick={() => setCold(true)}>
        <UserPlus size={16} /> {type === "call" ? "Cold call: new number" : "Text a new contact"}
      </button>
      <p className="px-1 text-xs font-semibold text-muted uppercase">Or pick an existing client</p>
      <ClientPicker options={options} onPick={(c) => setTarget({ clientId: c.id, company: c.company, type })} />
      {target && <LogSheet target={target} today={today} onClose={(ok) => { if (ok) setSaved(target.company); setTarget(null); }} />}
    </div>
  );
}

function ColdForm({ type, today, onDone, onCancel }: { type: ActivityType; today: string; onDone: (name: string) => void; onCancel: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ company: "", contactPerson: "", phone: "", area: "", notes: "" });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!f.company.trim()) return setError("Company name is required.");
    if (!outcome) return setError("How did it go?");
    start(async () => {
      const res = await logOrQueue("activity", { newClient: f, type, outcome, notes: f.notes, followUpDate: followUp, isCold: true });
      if (res.error) return setError(res.error);
      router.refresh();
      onDone(f.company);
    });
  }

  return (
    <div className="card space-y-4 p-4">
      <p className="font-semibold">New contact</p>
      <p className="-mt-3 text-xs text-muted">They&apos;ll be added to your client list as a prospect.</p>
      <NewContactFields value={f} onChange={setF} />
      <div>
        <span className="label">Outcome</span>
        <div className="flex flex-wrap gap-2">
          {OUTCOMES[type].map((o) => (
            <button key={o.value} type="button" className="chip" data-on={outcome === o.value} onClick={() => setOutcome(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>
      <FollowUpPicker value={followUp} onChange={setFollowUp} today={today} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={onCancel}>Cancel</button>
        <button className="btn-primary flex-1" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

type ContactDraft = { company: string; contactPerson: string; phone: string; area: string; notes: string };

function NewContactFields({ value: f, onChange, hideArea }: { value: ContactDraft; onChange: (v: ContactDraft) => void; hideArea?: boolean }) {
  const set = (k: keyof ContactDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <input className="input" placeholder="Company name *" value={f.company} onChange={set("company")} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Contact person" value={f.contactPerson} onChange={set("contactPerson")} />
        <input className="input" placeholder="Phone" inputMode="tel" value={f.phone} onChange={set("phone")} />
      </div>
      {!hideArea && <input className="input" placeholder="Area" value={f.area} onChange={set("area")} />}
      <VoiceTextarea placeholder="Notes" value={f.notes} onChange={(v) => onChange({ ...f, notes: v })} />
    </div>
  );
}

/* ---------------------------------------------------------------- Field visit */

interface MetRow { client: ClientOption; outcome: Outcome; followUp: string | null; notes: string }
interface OfficeRow extends ContactDraft { outcome: Outcome; followUp: string | null }

const VISIT_OUTCOMES = OUTCOMES.visit;
const NEW_OFFICE_OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "new_lead", label: "New lead" },
  { value: "interested", label: "Interested" },
  { value: "follow_up", label: "Follow-up" },
  { value: "not_interested", label: "Not interested" },
];

function FieldVisitForm({ options, areas, today }: { options: ClientOption[]; areas: string[]; today: string }) {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [met, setMet] = useState<MetRow[]>([]);
  const [offices, setOffices] = useState<OfficeRow[]>([]);
  const [picking, setPicking] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const blankOffice = (): OfficeRow => ({ company: "", contactPerson: "", phone: "", area: "", notes: "", outcome: "new_lead", followUp: null });

  function submit() {
    setError(null);
    if (!area.trim()) return setError("Which area did you visit?");
    start(async () => {
      const res = await logOrQueue("fieldVisit", {
        area,
        notes,
        met: met.map((m) => ({ clientId: m.client.id, outcome: m.outcome, notes: m.notes, followUpDate: m.followUp })),
        newOffices: offices.filter((o) => o.company.trim()).map((o) => ({ ...o, followUpDate: o.followUp })),
      });
      if (res.error) return setError(res.error);
      setDone(res.queued
        ? `No signal: visit to ${area} saved on your phone. It will sync automatically when you're back online.`
        : `Visit to ${area} saved: ${met.length} clients met, ${res.added ?? 0} new ${res.added === 1 ? "office" : "offices"} added to your list.`);
      setMet([]); setOffices([]); setNotes(""); setArea("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {done && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{done}</p>}

      <div className="card p-4">
        <label className="label" htmlFor="area">Area visited</label>
        <input id="area" className="input" list="areas" placeholder="e.g. Andheri" value={area} onChange={(e) => setArea(e.target.value)} />
        <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">Clients met · {met.length}</p>
          <button className="btn-secondary min-h-9 text-xs" onClick={() => setPicking(true)}><Plus size={14} /> Add</button>
        </div>
        {met.length === 0 && <p className="text-sm text-muted">Pick the existing clients you met from your list.</p>}
        <ul className="space-y-4">
          {met.map((m, i) => (
            <li key={m.client.id} className="space-y-2 border-t border-line pt-3 first:border-0 first:pt-0">
              <div className="flex items-center gap-2">
                <TierBadge tier={m.client.tier} />
                <span className="flex-1 truncate text-sm font-semibold">{m.client.company}</span>
                <button aria-label="Remove" className="text-muted" onClick={() => setMet(met.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VISIT_OUTCOMES.map((o) => (
                  <button key={o.value} className="chip min-h-8 px-2.5 text-xs" data-on={m.outcome === o.value} onClick={() => setMet(met.map((x, j) => j === i ? { ...x, outcome: o.value } : x))}>{o.label}</button>
                ))}
              </div>
              {(m.outcome === "follow_up" || m.outcome === "interested") && (
                <FollowUpPicker value={m.followUp} today={today} onChange={(v) => setMet(met.map((x, j) => j === i ? { ...x, followUp: v } : x))} />
              )}
              <VoiceTextarea rows={1} className="text-sm" placeholder="Notes (optional)" value={m.notes} onChange={(v) => setMet(met.map((x, j) => j === i ? { ...x, notes: v } : x))} />
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">New offices approached · {offices.length}</p>
          <button className="btn-secondary min-h-9 text-xs" onClick={() => setOffices([...offices, blankOffice()])}><Building2 size={14} /> Add</button>
        </div>
        {offices.length === 0 && <p className="text-sm text-muted">Walked into offices that aren&apos;t clients yet? Add them here and they&apos;ll join your list as prospects from tomorrow.</p>}
        <ul className="space-y-5">
          {offices.map((o, i) => (
            <li key={i} className="space-y-2 border-t border-line pt-4 first:border-0 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted uppercase">Office {i + 1}</span>
                <button aria-label="Remove" className="text-muted" onClick={() => setOffices(offices.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
              </div>
              <NewContactFields hideArea value={o} onChange={(v) => setOffices(offices.map((x, j) => j === i ? { ...x, ...v } : x))} />
              <div className="flex flex-wrap gap-1.5">
                {NEW_OFFICE_OUTCOMES.map((oc) => (
                  <button key={oc.value} className="chip min-h-8 px-2.5 text-xs" data-on={o.outcome === oc.value} onClick={() => setOffices(offices.map((x, j) => j === i ? { ...x, outcome: oc.value } : x))}>{oc.label}</button>
                ))}
              </div>
              {o.outcome !== "not_interested" && (
                <FollowUpPicker value={o.followUp} today={today} onChange={(v) => setOffices(offices.map((x, j) => j === i ? { ...x, followUp: v } : x))} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="card p-4">
        <label className="label" htmlFor="vnotes">Visit notes</label>
        <VoiceTextarea id="vnotes" value={notes} onChange={setNotes} placeholder="Anything worth remembering about this trip" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full" disabled={pending || (met.length === 0 && !offices.some((o) => o.company.trim()))} onClick={submit}>
        {pending ? "Saving…" : "Save field visit"}
      </button>

      {picking && (
        <Sheet title="Who did you meet?" onClose={() => setPicking(false)}>
          <ClientPicker
            autoFocus
            options={options}
            area={area}
            exclude={met.map((m) => m.client.id)}
            onPick={(c) => { setMet([...met, { client: c, outcome: "met", followUp: null, notes: "" }]); setPicking(false); }}
          />
        </Sheet>
      )}
    </div>
  );
}
