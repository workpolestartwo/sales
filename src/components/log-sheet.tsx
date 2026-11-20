"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { logOrQueue } from "@/lib/offline-queue";
import { addDays } from "@/lib/dates";
import { TYPE_NAMES, type ActivityType, type Outcome } from "@/lib/types";
import { TypeIcon } from "./ui";
import { VoiceTextarea } from "./voice-input";

/** Outcome choices per channel; "met" means contact was made (met / spoke / sent). */
export const OUTCOMES: Record<ActivityType, { value: Outcome; label: string }[]> = {
  visit: [
    { value: "met", label: "Met" },
    { value: "interested", label: "Interested" },
    { value: "follow_up", label: "Follow-up" },
    { value: "converted", label: "Got business" },
    { value: "not_interested", label: "Not interested" },
    { value: "not_reachable", label: "Not available" },
  ],
  call: [
    { value: "met", label: "Spoke" },
    { value: "interested", label: "Interested" },
    { value: "follow_up", label: "Follow-up" },
    { value: "converted", label: "Got business" },
    { value: "not_interested", label: "Not interested" },
    { value: "not_reachable", label: "No answer" },
  ],
  text: [
    { value: "met", label: "Sent" },
    { value: "interested", label: "Replied, interested" },
    { value: "follow_up", label: "Follow-up" },
    { value: "converted", label: "Got business" },
    { value: "not_interested", label: "Not interested" },
  ],
};

export { TYPE_NAMES };

export function FollowUpPicker({ value, onChange, today }: { value: string | null; onChange: (v: string | null) => void; today: string }) {
  const quick = [
    { label: "Tomorrow", d: addDays(today, 1) },
    { label: "3 days", d: addDays(today, 3) },
    { label: "1 week", d: addDays(today, 7) },
    { label: "2 weeks", d: addDays(today, 14) },
  ];
  return (
    <div>
      <span className="label">Follow up on</span>
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <button type="button" key={q.label} className="chip" data-on={value === q.d} onClick={() => onChange(value === q.d ? null : q.d)}>
            {q.label}
          </button>
        ))}
        <input type="date" className="input min-h-9 w-auto flex-1 text-sm" min={today} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />
      </div>
    </div>
  );
}

export interface LogTarget {
  clientId: string;
  company: string;
  type: ActivityType;
  planItemId?: string | null;
}

export function LogSheet({ target, today, onClose }: { target: LogTarget; today: string; onClose: (saved?: boolean) => void }) {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>(target.type);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pickOutcome(o: Outcome) {
    setOutcome(o);
    if (o === "follow_up" && !followUp) setFollowUp(addDays(today, 3));
  }

  function save() {
    if (!outcome) return setError("How did it go?");
    if (outcome === "follow_up" && !followUp) return setError("Pick a follow-up date.");
    start(async () => {
      const res = await logOrQueue("activity", { clientId: target.clientId, type, outcome, notes, followUpDate: followUp, planItemId: target.planItemId });
      if (res.error) return setError(res.error);
      onClose(true);
      router.refresh();
    });
  }

  return (
    <Sheet onClose={() => onClose(false)} title={target.company}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {(["visit", "call", "text"] as ActivityType[]).map((t) => (
            <button key={t} type="button" className="chip justify-center gap-1.5" data-on={type === t} onClick={() => { setType(t); setOutcome(null); }}>
              <TypeIcon type={t} /> {TYPE_NAMES[t]}
            </button>
          ))}
        </div>
        <div>
          <span className="label">Outcome</span>
          <div className="flex flex-wrap gap-2">
            {OUTCOMES[type].map((o) => (
              <button key={o.value} type="button" className="chip" data-on={outcome === o.value} onClick={() => pickOutcome(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <FollowUpPicker value={followUp} onChange={setFollowUp} today={today} />
        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <VoiceTextarea id="notes" value={notes} onChange={setNotes} placeholder="What was discussed? Tap the mic to speak" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="truncate text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="-mr-2 grid size-10 place-items-center rounded-full text-muted" aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
