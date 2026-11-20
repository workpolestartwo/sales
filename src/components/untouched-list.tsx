"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { daysBetween, formatDate } from "@/lib/dates";
import type { ClientStatus, Tier } from "@/lib/types";
import { Empty, TierBadge, tierStripe } from "./ui";
import { Stat } from "./day-summary";

export interface UntouchedRow {
  id: string;
  company: string;
  contactPerson: string | null;
  phone: string | null;
  area: string | null;
  tier: Tier;
  status: ClientStatus;
  score: number;
  shipments: number;
  lastShipment: string | null;
  lastTouch: string | null;
  followUp: string | null;
}

type Bucket = "all" | "lt90" | "lt180" | "180plus" | "never";

function bucketOf(r: UntouchedRow, today: string): Exclude<Bucket, "all"> {
  if (!r.lastTouch) return "never";
  const d = daysBetween(r.lastTouch, today);
  if (d < 90) return "lt90";
  if (d < 180) return "lt180";
  return "180plus";
}

export function UntouchedList({ rows, today, days }: { rows: UntouchedRow[]; today: string; days: number }) {
  const [bucket, setBucket] = useState<Bucket>("all");
  const [area, setArea] = useState("");
  const [tier, setTier] = useState<Tier | "">("");

  const counts = useMemo(() => {
    const c = { lt90: 0, lt180: 0, "180plus": 0, never: 0 };
    for (const r of rows) c[bucketOf(r, today)]++;
    return c;
  }, [rows, today]);

  const areas = useMemo(() => [...new Set(rows.map((r) => r.area?.trim()).filter(Boolean) as string[])].sort(), [rows]);

  const list = rows.filter(
    (r) =>
      (bucket === "all" || bucketOf(r, today) === bucket) &&
      (!area || r.area?.trim().toLowerCase() === area.toLowerCase()) &&
      (!tier || r.tier === tier),
  );

  async function exportSheet() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      list.map((r) => ({
        Company: r.company,
        "Contact person": r.contactPerson ?? "",
        Phone: r.phone ?? "",
        Area: r.area ?? "",
        Priority: r.tier,
        Status: r.status,
        "Total shipments": r.shipments,
        "Last shipment": r.lastShipment ? formatDate(r.lastShipment, { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
        "Last contact": r.lastTouch ? formatDate(r.lastTouch, { day: "2-digit", month: "2-digit", year: "numeric" }) : "Never",
        "Days untouched": r.lastTouch ? daysBetween(r.lastTouch, today) : "",
        "Follow-up": r.followUp ? formatDate(r.followUp, { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
      })),
    );
    ws["!cols"] = [{ wch: 34 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 15 }, { wch: 13 }, { wch: 13 }, { wch: 15 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Untouched clients");
    XLSX.writeFile(wb, `untouched-clients-${today}.xlsx`);
  }

  const BUCKETS: { key: Bucket; label: string; n: number }[] = [
    { key: "all", label: "All", n: rows.length },
    { key: "lt90", label: `${days}–90d`, n: counts.lt90 },
    { key: "lt180", label: "90–180d", n: counts.lt180 },
    { key: "180plus", label: "180d+", n: counts["180plus"] },
    { key: "never", label: "Never", n: counts.never },
  ].filter((b) => b.key === "all" || b.n > 0) as { key: Bucket; label: string; n: number }[];

  return (
    <div className="space-y-4 p-4">
      <section className="grid grid-cols-3 gap-2">
        <Stat label="Untouched" value={rows.length} />
        <Stat label="180+ days" value={counts["180plus"]} />
        <Stat label="Never contacted" value={counts.never} />
      </section>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {BUCKETS.map((b) => (
          <button key={b.key} className="chip shrink-0" data-on={bucket === b.key} onClick={() => setBucket(b.key)}>
            {b.label} <span className="ml-1 opacity-70">{b.n}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select className="input text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">All areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="input text-sm" value={tier} onChange={(e) => setTier(e.target.value as Tier | "")}>
          <option value="">All priorities</option>
          <option value="A">A · Top</option>
          <option value="B">B · Medium</option>
          <option value="C">C · Low</option>
        </select>
      </div>

      <button className="btn-secondary w-full" disabled={list.length === 0} onClick={exportSheet}>
        <Download size={16} /> Download sheet ({list.length})
      </button>

      {list.length === 0 ? (
        <Empty title={rows.length ? "Nothing matches these filters" : "No untouched clients"}>
          {rows.length ? "Try another area or range." : `Everyone has been contacted in the last ${days} days.`}
        </Empty>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {list.slice(0, 300).map((r) => (
            <li key={r.id}>
              <Link href={`/clients/${r.id}`} className={`flex items-center gap-3 px-3 py-3 active:bg-bg ${tierStripe(r.tier)}`}>
                <TierBadge tier={r.tier} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.company}</p>
                  <p className="truncate text-xs text-muted">
                    {[r.area, `${r.shipments} shipments`, r.lastShipment && `last shipped ${formatDate(r.lastShipment, { month: "short", year: "numeric" })}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs font-semibold text-red-700 tabular-nums">
                  {r.lastTouch ? `${daysBetween(r.lastTouch, today)}d` : "never"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.length > 300 && <p className="text-center text-xs text-muted">Showing 300 of {list.length}. The download has all of them.</p>}
    </div>
  );
}
