"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { areaKey } from "@/lib/areas";
import type { ClientOption } from "@/lib/data";
import { Sheet } from "./log-sheet";

interface AreaRow { key: string; area: string; due: number }

/** One quiet line showing today's field area; tap it to search and change. */
export function AreaPicker({
  focusArea,
  areas,
  options,
  onChoose,
}: {
  focusArea: string | null;
  areas: { area: string; count: number }[];
  options: ClientOption[];
  onChoose: (area: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const focusKey = areaKey(focusArea);

  // Areas with visits due come first, then every other area in the member's client list.
  const rows = useMemo(() => {
    const map = new Map<string, AreaRow>();
    for (const a of areas) {
      const key = areaKey(a.area);
      if (key) map.set(key, { key, area: a.area, due: a.count });
    }
    for (const c of options) {
      const key = areaKey(c.area);
      if (key && !map.has(key)) map.set(key, { key, area: c.area!.trim(), due: 0 });
    }
    return [...map.values()].sort((a, b) => b.due - a.due || a.area.localeCompare(b.area));
  }, [areas, options]);

  const due = rows.find((r) => r.key === focusKey)?.due ?? 0;
  const typed = q.trim();
  const needle = typed.toLowerCase();
  const list = rows.filter((r) => !needle || r.area.toLowerCase().includes(needle));
  const exact = rows.some((r) => r.key === areaKey(typed));

  function choose(area: string) {
    setOpen(false);
    setQ("");
    onChoose(area);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 border-b border-line pb-3 text-left">
        <MapPin size={18} className="shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">Field day in</span>
          <span className="block truncate text-base font-semibold">{focusArea ?? "Choose an area"}</span>
        </span>
        {due > 0 && <span className="shrink-0 text-sm text-muted tabular-nums">{due} due</span>}
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </button>

      {open && (
        <Sheet title="Where are you going today?" onClose={() => setOpen(false)}>
          <form onSubmit={(e) => { e.preventDefault(); if (typed) choose(list[0]?.area ?? typed); }} className="relative mb-2">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type an area" aria-label="Search or type an area" />
          </form>
          <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto">
            {typed && !exact && (
              <li>
                <button onClick={() => choose(typed)} className="flex min-h-12 w-full items-center text-left text-sm font-semibold text-brand">Use “{typed}”</button>
              </li>
            )}
            {list.map((r) => (
              <li key={r.key}>
                <button onClick={() => choose(r.area)} className="flex min-h-12 w-full items-center gap-3 text-left text-sm">
                  <span className={`min-w-0 flex-1 truncate ${r.key === focusKey ? "font-semibold" : ""}`}>{r.area}</span>
                  {r.due > 0 && <span className="text-muted tabular-nums">{r.due} due</span>}
                  {r.key === focusKey && <Check size={16} className="shrink-0 text-brand" />}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}
