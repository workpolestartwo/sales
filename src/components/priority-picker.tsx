"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPriority } from "@/app/actions/assignments";
import type { Tier } from "@/lib/types";
import { TIER_COLORS } from "./ui";

const CHOICES: { tier: Tier; label: string }[] = [
  { tier: "A", label: "Top" },
  { tier: "B", label: "Medium" },
  { tier: "C", label: "Low" },
];

/** Change a client's priority from their page. The salesperson's choice always wins. */
export function PriorityPicker({ clientId, current, chosen }: { clientId: string; current: Tier; chosen: boolean }) {
  const router = useRouter();
  const [tier, setTier] = useState<Tier>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(t: Tier) {
    if (t === tier && chosen) return;
    const prev = tier;
    setTier(t);
    start(async () => {
      const res = await setPriority([clientId], t);
      if (res.error) { setTier(prev); setError(res.error); }
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Priority">
        {CHOICES.map((o) => {
          const on = tier === o.tier && chosen;
          return (
            <button key={o.tier} role="radio" aria-checked={on} disabled={pending} onClick={() => pick(o.tier)}
              className={`min-h-10 rounded-xl border text-sm font-semibold ${on ? `${TIER_COLORS[o.tier].badge} border-transparent` : "border-line bg-surface text-ink"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      {!chosen && <p className="mt-1 text-xs text-muted">Set automatically from shipments. Pick one to fix it yourself.</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
