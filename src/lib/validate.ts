// Small input sanitizers for server actions. Everything from the browser is untrusted.
import type { ActivityType, Outcome } from "./types";

export function str(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function date(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return isNaN(Date.parse(v)) ? null : v;
}

export function int(v: unknown, min = 0, max = 1_000_000): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function uuid(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

const TYPES: ActivityType[] = ["visit", "call", "text"];
export function activityType(v: unknown): ActivityType | null {
  return TYPES.includes(v as ActivityType) ? (v as ActivityType) : null;
}

const OUTCOMES: Outcome[] = ["interested", "follow_up", "not_reachable", "not_interested", "converted", "met", "new_lead"];
export function outcome(v: unknown): Outcome | null {
  return OUTCOMES.includes(v as Outcome) ? (v as Outcome) : null;
}

export type ActionResult = { error?: string; ok?: boolean; id?: string };
