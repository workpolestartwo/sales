"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { ClientOption } from "@/lib/data";
import { areaDistance } from "@/lib/areas";
import { TierBadge, tierStripe } from "./ui";

/**
 * Searchable list of the member's own clients. When `area` is set, clients
 * in that area are listed first (useful on field visits).
 */
export function ClientPicker({
  options,
  onPick,
  exclude = [],
  area,
  placeholder = "Search company, person or area",
  autoFocus,
}: {
  options: ClientOption[];
  onPick: (c: ClientOption) => void;
  exclude?: string[];
  area?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const skip = new Set(exclude);
    const needle = q.trim().toLowerCase();
    // With an area set: that area first, then nearby areas by distance, then everyone else.
    const dist = (c: ClientOption) => (area ? areaDistance(area, c.area) ?? 999 : 0);
    return options
      .filter((c) => !skip.has(c.id))
      .filter((c) => !needle || [c.company, c.contact_person, c.area, c.phone].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const da = Math.round(dist(a)), db = Math.round(dist(b));
        if (da !== db) return da - db;
        return a.tier.localeCompare(b.tier) || a.company.localeCompare(b.company);
      })
      .slice(0, 40);
  }, [options, exclude, q, area]);

  return (
    <div>
      <div className="relative">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} />
      </div>
      <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {results.length === 0 && <li className="p-4 text-center text-sm text-muted">No matching clients</li>}
        {results.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick(c)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-bg ${tierStripe(c.tier)}`}>
              <TierBadge tier={c.tier} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.company}</span>
                <span className="block truncate text-xs text-muted">{[c.contact_person, c.area].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
