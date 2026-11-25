"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, RotateCcw, Send } from "lucide-react";
import { closeFlag, createFlag, reopenFlag, replyToManagement, sendToTeam } from "@/app/actions/management";
import { formatDate } from "@/lib/dates";

export interface ThreadMessage { id: string; group_id: string; sender_id: string; body: string; created_at: string; sender_name: string }

const when = (ts: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ts));

/** One conversation. Messages sent to several people appear once. */
export function MessageThread({ messages, meId, managementIds }: { messages: ThreadMessage[]; meId: string; managementIds?: string[] }) {
  const seen = new Set<string>();
  const list = messages.filter((m) => (seen.has(m.group_id) ? false : (seen.add(m.group_id), true)));
  if (!list.length) return <p className="py-8 text-center text-sm text-muted">No messages yet.</p>;
  return (
    <ol className="space-y-3">
      {list.map((m) => {
        // Management view: anything sent by management (Director or VP) is "our side".
        const mine = managementIds ? managementIds.includes(m.sender_id) : m.sender_id === meId;
        const showName = !mine || m.sender_id !== meId;
        return (
          <li key={m.group_id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bg-brand text-brand-ink" : "border border-line bg-surface"}`}>
              {showName && <p className={`mb-0.5 text-xs font-semibold ${mine ? "text-brand-ink/80" : "text-muted"}`}>{m.sender_name}</p>}
              <p className="break-words whitespace-pre-wrap">{m.body}</p>
              <p className={`mt-1 text-[11px] ${mine ? "text-brand-ink/70" : "text-muted"}`}>{when(m.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Write box. `to` = salespeople ids (management), "all", or "management" (a salesperson replying). */
export function Composer({ to, placeholder = "Write a message" }: { to: string[] | "all" | "management"; placeholder?: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    if (!body.trim()) return;
    start(async () => {
      const res = to === "management" ? await replyToManagement(body) : await sendToTeam({ to, body });
      if (res.error) return setError(res.error);
      setBody("");
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <textarea className="input min-h-11 flex-1 py-2.5" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} />
        <button className="btn-primary h-11 w-11 shrink-0 px-0" disabled={pending || !body.trim()} onClick={send} aria-label="Send"><Send size={18} /></button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export interface FlagItem {
  id: string;
  note: string;
  status: "open" | "done";
  created_by_name: string | null;
  created_at: string;
  done_note: string | null;
  done_at: string | null;
  client_id: string | null;
  company?: string | null;
}

/** A flag from management. Salespeople can mark it done (with a reply); management can reopen it. */
export function FlagCard({ flag: f, canClose, canReopen }: { flag: FlagItem; canClose?: boolean; canReopen?: boolean }) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const open = f.status === "open";
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { await fn(); setClosing(false); router.refresh(); });

  return (
    <div className={`card space-y-2 p-4 ${open ? "border-red-200 bg-red-50/60" : ""}`}>
      <div className="flex items-start gap-2">
        <Flag size={16} className={`mt-0.5 shrink-0 ${open ? "text-red-700" : "text-muted"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm break-words whitespace-pre-wrap">{f.note}</p>
          <p className="mt-1 text-xs text-muted">
            {[f.company, `${f.created_by_name ?? "Management"} · ${formatDate(f.created_at.slice(0, 10))}`].filter(Boolean).join(" · ")}
          </p>
          {!open && (
            <p className="mt-1 text-xs text-green-800">
              <CheckCircle2 size={12} className="inline" /> Done{f.done_at ? ` ${formatDate(f.done_at.slice(0, 10))}` : ""}{f.done_note ? `: ${f.done_note}` : ""}
            </p>
          )}
        </div>
      </div>
      {open && canClose && (closing ? (
        <div className="space-y-2">
          <textarea className="input py-2 text-sm" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What did you do? (optional)" />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setClosing(false)}>Cancel</button>
            <button className="btn-primary flex-1" disabled={pending} onClick={() => run(() => closeFlag(f.id, reply))}>Mark done</button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary min-h-9 w-full text-xs" onClick={() => setClosing(true)}><CheckCircle2 size={14} /> Mark done</button>
      ))}
      {!open && canReopen && (
        <button className="btn-ghost min-h-9 px-2 text-xs" disabled={pending} onClick={() => run(() => reopenFlag(f.id))}><RotateCcw size={14} /> Reopen</button>
      )}
    </div>
  );
}

/** Management: flag a salesperson, optionally about one client. */
export function FlagForm({ memberId, clientId, label }: { memberId: string; clientId?: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) return <button className="btn-secondary w-full" onClick={() => setOpen(true)}><Flag size={16} /> {label}</button>;
  return (
    <div className="card space-y-2 p-4">
      <textarea className="input py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs attention? They'll get a notification." autoFocus />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn-primary flex-1" disabled={pending || !note.trim()} onClick={() => start(async () => {
          const res = await createFlag({ memberId, clientId, note });
          if (res.error) return setError(res.error);
          setNote(""); setOpen(false); router.refresh();
        })}><Flag size={16} /> Send flag</button>
      </div>
    </div>
  );
}
