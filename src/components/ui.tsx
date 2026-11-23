import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MeLink } from "./me-link";
import type { ActivityType, Tier } from "@/lib/types";
import { MessageCircle, Phone, MapPin } from "lucide-react";

export function PageHeader({ title, subtitle, back, action, hideMe }: { title: string; subtitle?: string; back?: string; action?: React.ReactNode; hideMe?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-bg/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
      {back && (
        <Link href={back} className="-ml-2 grid size-10 place-items-center rounded-full text-muted" aria-label="Back">
          <ChevronLeft size={22} />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
      {!back && !hideMe && <MeLink compact={Boolean(action)} />}
    </header>
  );
}

/** Client importance colours: A red-orange (top), B yellow (medium), C green (low). */
export const TIER_COLORS: Record<Tier, { badge: string; stripe: string; label: string }> = {
  A: { badge: "bg-orange-600 text-white", stripe: "border-l-orange-600", label: "Top priority" },
  B: { badge: "bg-yellow-400 text-yellow-950", stripe: "border-l-yellow-400", label: "Medium" },
  C: { badge: "bg-green-600 text-white", stripe: "border-l-green-600", label: "Low" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span title={TIER_COLORS[tier].label} className={`inline-grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${TIER_COLORS[tier].badge}`}>
      {tier}
    </span>
  );
}

/** Left colour strip for a client row. */
export function tierStripe(tier: Tier | null | undefined) {
  return tier ? `border-l-4 ${TIER_COLORS[tier].stripe}` : "border-l-4 border-l-transparent";
}

export function TierLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {(["A", "B", "C"] as Tier[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className={`size-2.5 rounded-full ${TIER_COLORS[t].badge.split(" ")[0]}`} /> {t} · {TIER_COLORS[t].label}
        </span>
      ))}
    </div>
  );
}

export function TypeIcon({ type, size = 16 }: { type: ActivityType; size?: number }) {
  if (type === "visit") return <MapPin size={size} />;
  if (type === "call") return <Phone size={size} />;
  return <MessageCircle size={size} />;
}

export function Meter({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-semibold tabular-nums">
          {value}
          <span className="text-muted">/{target}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${value >= target ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card px-5 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function telHref(phone: string | null) {
  return phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined;
}

/** WhatsApp link; 10-digit numbers are assumed to be Indian (+91). */
export function waHref(phone: string | null) {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
  return `https://wa.me/${digits}`;
}
