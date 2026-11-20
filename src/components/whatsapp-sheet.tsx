"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Settings2 } from "lucide-react";
import { getQuoteLanes, listTemplates, type Template } from "@/app/actions/templates";
import { formatDate } from "@/lib/dates";
import { fillTemplate, ratesText, type QuoteLane } from "@/lib/templates";
import { logOrQueue } from "@/lib/offline-queue";
import { Sheet } from "./log-sheet";
import { waHref } from "./ui";

export interface WaTarget {
  clientId: string;
  company: string;
  contactPerson: string | null;
  phone: string | null;
  planItemId?: string | null;
}

/**
 * Pick one of your templates, add live quote rates if the template uses {rates},
 * tweak the text, and open WhatsApp with it ready to send. Then log it in one tap.
 */
export function WhatsAppSheet({ target, myName, onClose }: { target: WaTarget; myName: string; onClose: () => void }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [lanes, setLanes] = useState<QuoteLane[]>([]);
  const [picked, setPicked] = useState<Template | null>(null);
  const [laneKeys, setLaneKeys] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    listTemplates().then(setTemplates).catch(() => setTemplates([]));
    getQuoteLanes().then(setLanes).catch(() => setLanes([]));
  }, []);

  const usesRates = picked?.body.includes("{rates}") ?? false;

  // Fill the message from a template and the chosen lanes (quote prices only).
  function compose(t: Template | null, keys: string[]) {
    if (!t) return;
    setText(fillTemplate(t.body, {
      contact: target.contactPerson,
      company: target.company,
      myName,
      rates: ratesText(lanes.filter((l) => keys.includes(l.key)), (d) => formatDate(d)),
    }));
  }
  const pickTemplate = (t: Template) => { setPicked(t); compose(t, laneKeys); };
  const toggleLane = (key: string, on: boolean) => {
    const next = on ? [...laneKeys, key] : laneKeys.filter((k) => k !== key);
    setLaneKeys(next);
    compose(picked, next);
  };

  const href = waHref(target.phone);

  function send() {
    if (!href) return;
    window.open(`${href}?text=${encodeURIComponent(text)}`, "_blank", "noreferrer");
    setOpened(true);
  }

  function logSent() {
    start(async () => {
      const res = await logOrQueue("activity", {
        clientId: target.clientId,
        type: "text",
        outcome: "met",
        notes: picked ? `WhatsApp: ${picked.name}` : "WhatsApp message",
        planItemId: target.planItemId ?? null,
      });
      setStatus(res.error ?? (res.queued ? "Saved offline. Will sync when you're back online." : "Logged as sent."));
      if (!res.error) setTimeout(onClose, 900);
    });
  }

  return (
    <Sheet title={`WhatsApp · ${target.company}`} onClose={onClose}>
      {!href ? (
        <p className="text-sm text-muted">This client has no phone number. Add one from their client page first.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">Template</span>
              <Link href="/settings/templates" className="flex items-center gap-1 text-xs font-semibold text-brand"><Settings2 size={12} /> My templates</Link>
            </div>
            {templates === null ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button key={t.id} className="chip" data-on={picked?.id === t.id} onClick={() => pickTemplate(t)}>{t.name}</button>
                ))}
                <button className="chip" data-on={picked === null} onClick={() => { setPicked(null); setText(""); }}>Blank</button>
              </div>
            )}
          </div>

          {usesRates && (
            <div>
              <span className="label">Include rates for</span>
              {lanes.length === 0 ? (
                <p className="text-sm text-muted">No valid rates on the Rates dashboard right now.</p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {lanes.map((l) => (
                    <label key={l.key} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm">
                      <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={laneKeys.includes(l.key)} onChange={(e) => toggleLane(l.key, e.target.checked)} />
                      <span className="flex-1">{l.origin} → {l.destination}</span>
                      <span className="text-xs text-muted uppercase">{l.direction}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-muted">Prices are suggested quote rates (buy + markup), never buy rates.</p>
            </div>
          )}

          <div>
            <span className="label">Message</span>
            <textarea className="input py-2 text-sm" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pick a template or type a message" />
          </div>

          {status && <p className="text-sm text-emerald-700">{status}</p>}
          {!opened ? (
            <button className="btn-primary w-full bg-[#128C7E]" disabled={!text.trim()} onClick={send}>
              <MessageCircle size={16} /> Open in WhatsApp
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={send}><MessageCircle size={16} /> Open again</button>
              <button className="btn-primary" disabled={pending} onClick={logSent}><CheckCircle2 size={16} /> Log as sent</button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
