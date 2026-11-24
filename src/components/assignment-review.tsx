"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { acceptAssignments, dropAssignments, reassignAssignments } from "@/app/actions/assignments";
import type { TeamMember } from "@/lib/team-match";
import { formatDate } from "@/lib/dates";
import { Sheet } from "./log-sheet";

export interface PendingAssignment {
  id: string;
  batch_id: string;
  company: string;
  area: string | null;
  contact_person: string | null;
  phone: string | null;
  assigned_by: string;
  assigned_by_name: string | null;
  created_at: string;
}

const istDate = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ts));

export function AssignmentReview({ rows, team, meId }: { rows: PendingAssignment[]; team: TeamMember[]; meId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const [passing, setPassing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // One group per upload: "From Pratham Desai · 24 Nov".
  const groups = useMemo(() => {
    const m = new Map<string, PendingAssignment[]>();
    for (const r of rows) m.set(r.batch_id, [...(m.get(r.batch_id) ?? []), r]);
    return [...m.values()];
  }, [rows]);

  // Only rows still on screen count (others were just approved or passed on).
  const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setMany = (list: PendingAssignment[], on: boolean) => setSelected((s) => { const n = new Set(s); for (const r of list) if (on) n.add(r.id); else n.delete(r.id); return n; });

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) return setError(res.error);
      setError(null);
      after?.();
      router.refresh();
    });

  return (
    <div className="space-y-5 pb-28">
      {groups.map((g) => {
        const allOn = g.every((r) => selected.has(r.id));
        return (
          <section key={g.length + g[0].batch_id}>
            <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-sm font-bold">{g[0].assigned_by === meId ? "Uploaded by you" : `From ${g[0].assigned_by_name ?? "a teammate"}`} · {formatDate(istDate(g[0].created_at))}</h2>
              <button className="text-xs font-semibold text-brand" onClick={() => setMany(g, !allOn)}>{allOn ? "Clear all" : "Select all"}</button>
            </div>
            <ul className="card divide-y divide-line overflow-hidden">
              {g.map((r) => {
                const on = selected.has(r.id);
                return (
                  <li key={r.id}>
                    <button onClick={() => toggle(r.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${on ? "" : "opacity-60"}`} aria-pressed={on}>
                      <span className={`grid size-6 shrink-0 place-items-center rounded-md border-2 ${on ? "border-brand bg-brand text-brand-ink" : "border-line"}`}>
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.company}</span>
                        <span className="block truncate text-xs text-muted">{[r.area, r.contact_person, r.phone].filter(Boolean).join(" · ") || "No details"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-xl space-y-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button className="btn-primary" disabled={pending || !ids.length} onClick={() => run(() => acceptAssignments(ids), () => router.push("/clients/priority"))}>
              <Check size={18} /> {ids.length === rows.length ? `Approve all ${ids.length}` : `Approve ${ids.length}`}
            </button>
            <button className="btn-secondary" disabled={pending || !ids.length} onClick={() => setPassing(true)}>Not mine</button>
          </div>
        </div>
      </div>

      {passing && (
        <Sheet title={`Not yours? (${ids.length})`} onClose={() => setPassing(false)}>
          <p className="mb-3 text-sm text-muted">Pass {ids.length === 1 ? "this client" : `these ${ids.length} clients`} to the right salesperson. They&apos;ll get a request to approve.</p>
          <ul className="max-h-[45dvh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {team.length === 0 && <li className="p-4 text-sm text-muted">No other team members yet.</li>}
            {team.map((m) => (
              <li key={m.id}>
                <button disabled={pending} onClick={() => run(() => reassignAssignments(ids, m.id), () => setPassing(false))} className="flex min-h-12 w-full items-center px-4 text-left text-sm font-medium active:bg-bg">
                  {m.full_name}
                </button>
              </li>
            ))}
          </ul>
          <button className="btn-ghost mt-3 w-full text-red-600" disabled={pending}
            onClick={() => confirm(`Remove ${ids.length === 1 ? "this client" : `these ${ids.length} clients`}? Nobody will get them.`) && run(() => dropAssignments(ids), () => setPassing(false))}>
            Not our client, remove
          </button>
        </Sheet>
      )}
    </div>
  );
}
