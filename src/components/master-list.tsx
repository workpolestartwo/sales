"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { formatDate, relativeDays } from "@/lib/dates";
import type { Tier } from "@/lib/types";
import { Empty, TierBadge } from "./ui";

export interface MasterRow {
  id: string;
  company: string;
  area: string | null;
  contact_person: string | null;
  phone: string | null;
  tier: Tier | null;
  status: string;
  priority_pending: boolean;
  last_touch_date: string | null;
  next_due_date: string | null;
  total_shipments: number;
  source: string;
  created_at: string;
  owner_id: string;
  owner_name: string;
  kind: "client" | "request";
}

type Show = "all" | "client" | "request";

function stateLabel(r: MasterRow) {
  if (r.kind === "request") return "Awaiting approval";
  if (r.priority_pending) return "Needs priority";
  if (r.status === "lost") return "Lost";
  if (r.status === "prospect") return "Prospect";
  return null;
}

/** Admin: one searchable list of every salesperson's clients, with Excel download. */
export function MasterList({ rows, today, initialOwner = "" }: { rows: MasterRow[]; today: string; initialOwner?: string }) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState(initialOwner);
  const [show, setShow] = useState<Show>("all");

  const owners = useMemo(() => {
    const m = new Map<string, { name: string; clients: number; requests: number }>();
    for (const r of rows) {
      const o = m.get(r.owner_id) ?? { name: r.owner_name, clients: 0, requests: 0 };
      if (r.kind === "client") o.clients++; else o.requests++;
      m.set(r.owner_id, o);
    }
    return [...m].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) =>
    (!owner || r.owner_id === owner) &&
    (show === "all" || r.kind === show) &&
    (!needle || [r.company, r.area, r.contact_person, r.phone, r.owner_name].some((v) => v?.toLowerCase().includes(needle))),
  );
  const clients = rows.filter((r) => r.kind === "client").length;

  async function exportSheet() {
    const XLSX = await import("xlsx");
    const d = (v: string | null) => (v ? formatDate(v, { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
    const ws = XLSX.utils.json_to_sheet(list.map((r) => ({
      Client: r.company,
      Salesperson: r.owner_name,
      Area: r.area ?? "",
      "Contact person": r.contact_person ?? "",
      Phone: r.phone ?? "",
      Priority: r.kind === "request" || r.priority_pending ? "" : r.tier === "A" ? "Top" : r.tier === "B" ? "Medium" : "Low",
      State: stateLabel(r) ?? "Active",
      "Last contact": d(r.last_touch_date),
      "Next due": d(r.next_due_date),
      Shipments: r.total_shipments,
      Added: d(r.created_at.slice(0, 10)),
    })));
    ws["!cols"] = [{ wch: 34 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 13 }, { wch: 9 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master list");
    XLSX.writeFile(wb, `master-list-${today}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        <b className="text-ink">{clients}</b> clients across <b className="text-ink">{owners.length}</b> salespeople
        {rows.length > clients && <> · <b className="text-ink">{rows.length - clients}</b> awaiting approval</>}
      </p>

      <div className="relative">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client, area, phone or salesperson" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className="input text-sm" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Salesperson">
          <option value="">Everyone</option>
          {owners.map(([id, o]) => <option key={id} value={id}>{o.name} ({o.clients})</option>)}
        </select>
        <select className="input text-sm" value={show} onChange={(e) => setShow(e.target.value as Show)} aria-label="Show">
          <option value="all">Clients + requests</option>
          <option value="client">Clients only</option>
          <option value="request">Awaiting approval</option>
        </select>
      </div>

      <button className="btn-secondary w-full" disabled={!list.length} onClick={exportSheet}><Download size={16} /> Download ({list.length})</button>

      {list.length === 0 ? (
        <Empty title="No clients match" />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.slice(0, 300).map((r) => {
            const state = stateLabel(r);
            return (
              <li key={`${r.kind}-${r.id}`}>
               <Link href={r.kind === "client" ? `/admin/client/${r.id}` : `/admin/member/${r.owner_id}`} className="flex items-center gap-3 px-4 py-3 active:bg-bg">
                {r.tier && r.kind === "client" && !r.priority_pending ? <TierBadge tier={r.tier} /> : <span className="size-6 shrink-0 rounded-md border border-dashed border-line" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.company}</span>
                  <span className="block truncate text-xs text-muted">{[r.owner_name, r.area, state ?? (r.kind === "client" ? `contact ${relativeDays(r.last_touch_date, today)}` : null)].filter(Boolean).join(" · ")}</span>
                </span>
               </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 300 && <p className="text-center text-xs text-muted">Showing 300 of {list.length}. The download has all of them.</p>}
    </div>
  );
}
