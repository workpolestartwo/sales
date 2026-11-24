"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPriority } from "@/app/actions/assignments";
import type { Tier } from "@/lib/types";
import { TIER_COLORS, TierLegend } from "./ui";

export interface QueueClient { id: string; company: string; area: string | null; contact_person: string | null }

const CHOICES: { tier: Tier; label: string }[] = [
  { tier: "A", label: "Top" },
  { tier: "B", label: "Medium" },
  { tier: "C", label: "Low" },
];

/**
 * One tap per client. A client leaves the list as soon as it has a priority, and
 * from then on it's part of the normal cycle (Top clients come up weekly).
 */
export function PriorityQueue({ clients }: { clients: QueueClient[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, Tier>>({});
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const left = clients.filter((c) => !done[c.id]);

  function choose(id: string, tier: Tier) {
    setDone((d) => ({ ...d, [id]: tier }));
    start(async () => {
      const res = await setPriority([id], tier);
      if (res.error) {
        setError(res.error);
        setDone((d) => { const n = { ...d }; delete n[id]; return n; });
      }
    });
  }

  function setRemaining(tier: Tier) {
    const ids = left.map((c) => c.id);
    if (!ids.length || !confirm(`Set all ${ids.length} remaining clients to ${CHOICES.find((c) => c.tier === tier)!.label}?`)) return;
    start(async () => {
      const res = await setPriority(ids, tier);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <TierLegend />
      <p className="text-sm text-muted">
        <b>Top</b> clients are kept in touch every week. <b>Medium</b> and <b>Low</b> come up when you set a follow-up, and in the untouched list. You can change a priority any time from the client&apos;s page.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {left.length === 0 ? (
        <div className="card p-5 text-center">
          <p className="font-semibold">All {clients.length} done</p>
          <button className="btn-primary mt-3 w-full" onClick={() => { router.push("/today"); router.refresh(); }}>Build your day</button>
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {left.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-sm font-semibold break-words">{c.company}</span>
                <span className="block truncate text-xs text-muted">{[c.area, c.contact_person].filter(Boolean).join(" · ") || "No details"}</span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                {CHOICES.map((o) => (
                  <button key={o.tier} onClick={() => choose(c.id, o.tier)} aria-label={`${o.label} priority for ${c.company}`}
                    className={`grid h-10 min-w-11 place-items-center rounded-lg px-2 text-xs font-bold ${TIER_COLORS[o.tier].badge}`}>
                    {o.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {left.length > 5 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Set all remaining to:</span>
          {CHOICES.map((o) => <button key={o.tier} className="chip min-h-8 px-2.5 text-xs" onClick={() => setRemaining(o.tier)}>{o.label}</button>)}
        </div>
      )}
    </div>
  );
}
