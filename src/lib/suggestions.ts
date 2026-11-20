import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, daysBetween } from "./dates";
import { areaKey, nearbyDistance } from "./areas";
import type { ActivityType, Client, Profile, Tier } from "./types";

export interface Suggestion {
  clientId: string;
  company: string;
  contactPerson: string | null;
  phone: string | null;
  area: string | null;
  tier: Tier;
  type: ActivityType;
  reason: string;
  source: "suggested" | "backlog";
  missCount: number;
  recommended: boolean;
  /** An untouched (stagnant) client offered for revival. Never pre-selected. */
  revive?: boolean;
  /** Not due, but in/near today's field area. Never pre-selected. */
  nearby?: boolean;
  /** Distance from today's field area, for ordering visits. */
  distanceKm?: number;
}

const REVIVE_PER_DAY = 5;
const NEARBY_PER_DAY = 8;

export interface SuggestionResult {
  focusArea: string | null;
  areas: { area: string; count: number }[];
  suggestions: Suggestion[];
}

const TIER_WEIGHT: Record<Tier, number> = { A: 3, B: 2, C: 1 };
const DEFAULT_CHANNEL: Record<Tier, ActivityType> = { A: "visit", B: "call", C: "text" };
const UPGRADE: Record<ActivityType, ActivityType> = { text: "call", call: "visit", visit: "visit" };

type ClientRow = Pick<
  Client,
  "id" | "company" | "contact_person" | "phone" | "area" | "tier" | "status" | "next_due_date" | "next_follow_up" | "last_contact_date" | "last_meeting_date"
>;

/**
 * Builds the morning suggestions for the Day Builder.
 *
 * 1. Backlog: items missed in the last 14 days whose client has not been contacted since.
 *    These come first, keep their original channel, and get flagged when skipped repeatedly.
 * 2. Due clients: next_due_date <= today (follow-ups and contact cadence), ranked by
 *    tier weight and how overdue they are. Channel defaults by tier and is upgraded when
 *    a client is badly overdue.
 * 3. Visits are grouped around one focus area; visit candidates elsewhere become calls.
 * 4. The top items up to the member's daily targets are pre-selected ("recommended").
 */
export async function buildSuggestions(
  supabase: SupabaseClient,
  today: string,
  profile: Profile,
  requestedArea?: string | null,
): Promise<SuggestionResult> {
  const lookahead = addDays(today, 3);
  const backlogSince = addDays(today, -14);

  const stagnantBefore = addDays(today, -(profile.stagnant_after_days ?? 60));
  const [{ data: due }, { data: missed }, { data: stagnant }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, company, contact_person, phone, area, tier, status, next_due_date, next_follow_up, last_contact_date, last_meeting_date")
      .neq("status", "lost")
      .lte("next_due_date", lookahead)
      .order("next_due_date", { ascending: true })
      .limit(500),
    supabase
      .from("plan_items")
      .select("client_id, type, day_plans!inner(plan_date), clients!inner(id, company, contact_person, phone, area, tier, status, next_due_date, next_follow_up, last_contact_date, last_meeting_date)")
      .eq("status", "missed")
      .gte("day_plans.plan_date", backlogSince)
      .lt("day_plans.plan_date", today),
    // Most valuable clients nobody has touched in a long time.
    supabase
      .from("clients")
      .select("id, company, contact_person, phone, area, tier, status, next_due_date, next_follow_up, last_contact_date, last_meeting_date, last_touch_date, total_shipments")
      .neq("status", "lost")
      .gt("value_score", 0)
      .or(`last_touch_date.is.null,last_touch_date.lt.${stagnantBefore}`)
      .order("value_score", { ascending: false })
      .limit(REVIVE_PER_DAY * 4),
  ]);

  // ---- Backlog ------------------------------------------------------------
  const backlog = new Map<string, { client: ClientRow; type: ActivityType; misses: number; lastPlanned: string }>();
  for (const row of (missed ?? []) as unknown as {
    client_id: string;
    type: ActivityType;
    day_plans: { plan_date: string };
    clients: ClientRow;
  }[]) {
    const c = row.clients;
    if (c.status === "lost") continue;
    const planDate = row.day_plans.plan_date;
    // Contacted since it was missed? Then it is no longer backlog.
    if (c.last_contact_date && c.last_contact_date >= planDate) continue;
    const existing = backlog.get(c.id);
    if (existing) {
      existing.misses += 1;
      if (planDate > existing.lastPlanned) {
        existing.lastPlanned = planDate;
        existing.type = row.type;
      }
    } else {
      backlog.set(c.id, { client: c, type: row.type, misses: 1, lastPlanned: planDate });
    }
  }

  const all: (Suggestion & { rank: number })[] = [];
  for (const { client: c, type, misses } of backlog.values()) {
    all.push({
      ...base(c),
      type,
      source: "backlog",
      missCount: misses,
      reason: misses >= 2 ? `Skipped ${misses}× in 2 weeks, don't let this slip` : "Carried over from a missed plan",
      recommended: false,
      rank: 1000 + misses * 100 + TIER_WEIGHT[c.tier] * 10,
    });
  }

  // ---- Due clients --------------------------------------------------------
  for (const c of (due ?? []) as ClientRow[]) {
    if (backlog.has(c.id) || !c.next_due_date) continue;
    const overdue = daysBetween(c.next_due_date, today); // >0 overdue, <0 upcoming
    const lastTouch = maxDate(c.last_contact_date, c.last_meeting_date);
    let type: ActivityType = c.status === "prospect" ? "call" : DEFAULT_CHANNEL[c.tier];
    // Overdue by more than a full contact cycle: step up the channel (text → call → meet).
    if (overdue > (profile.contact_every_days ?? 7)) type = UPGRADE[type];

    let reason: string;
    if (c.next_follow_up && c.next_follow_up <= today) {
      reason = overdue > 0 ? `Follow-up was due ${overdue}d ago` : "Follow-up due today";
    } else if (!lastTouch) {
      reason = "Never contacted";
    } else if (overdue > 0) {
      reason = `Last contact ${daysBetween(lastTouch, today)}d ago, ${overdue}d overdue`;
    } else if (overdue === 0) {
      reason = `Due today, last contact ${daysBetween(lastTouch, today)}d ago`;
    } else {
      reason = `Due in ${-overdue}d`;
    }
    if (c.status === "prospect") reason = `Prospect · ${reason}`;

    all.push({
      ...base(c),
      type,
      source: "suggested",
      missCount: 0,
      reason,
      recommended: false,
      rank: TIER_WEIGHT[c.tier] * 10 + Math.max(-5, Math.min(overdue, 60)) + (c.next_follow_up && c.next_follow_up <= today ? 25 : 0),
    });
  }

  // ---- Revive: a few high-value untouched clients, offered but not ticked --
  const taken = new Set(all.map((s) => s.clientId));
  let revived = 0;
  for (const c of (stagnant ?? []) as (ClientRow & { last_touch_date: string | null; total_shipments: number })[]) {
    if (revived >= REVIVE_PER_DAY || taken.has(c.id)) continue;
    revived++;
    all.push({
      ...base(c),
      type: "call",
      source: "suggested",
      missCount: 0,
      reason: `${c.last_touch_date ? `Untouched ${daysBetween(c.last_touch_date, today)}d` : "Never contacted"} · ${c.total_shipments} shipments`,
      recommended: false,
      revive: true,
      rank: -1000, // never pre-selected ahead of due clients
    });
  }

  // ---- Focus area for visits ---------------------------------------------
  // "Andheri", "Andheri (E)" and "andheri east" count as one area.
  const areaScore = new Map<string, { area: string; score: number; count: number }>();
  for (const s of all) {
    const key = areaKey(s.area);
    if (s.type !== "visit" || !key) continue;
    const entry = areaScore.get(key) ?? { area: s.area!.trim(), score: 0, count: 0 };
    entry.score += Math.max(s.rank, 1);
    entry.count += 1;
    areaScore.set(key, entry);
  }
  const areas = [...areaScore.values()].sort((a, b) => b.score - a.score);
  const focusArea = requestedArea?.trim() || areas[0]?.area || null;

  // Visits in the focus area or a nearby one stay visits (ordered by distance);
  // anything further away becomes a call for today.
  for (const s of all) {
    if (s.type !== "visit" || s.source === "backlog") continue;
    const d = nearbyDistance(focusArea, s.area);
    if (d == null) {
      s.type = "call";
      s.reason += " · not near today's area, call instead";
    } else {
      s.distanceKm = d;
      if (d > 0) s.reason += ` · ~${Math.max(1, Math.round(d))} km from ${focusArea}`;
    }
  }

  // ---- Also nearby: clients around today's area worth dropping in on -------
  // Not due yet and not already suggested, but in/near the area and not visited in 2+ weeks.
  if (focusArea) {
    const already = new Set(all.map((s) => s.clientId));
    const { data: around } = await supabase
      .from("clients")
      .select("id, company, contact_person, phone, area, tier, status, next_due_date, next_follow_up, last_contact_date, last_meeting_date, last_touch_date, value_score")
      .neq("status", "lost")
      .not("area", "is", null)
      .or(`last_meeting_date.is.null,last_meeting_date.lt.${addDays(today, -14)}`)
      .order("value_score", { ascending: false })
      .limit(3000);
    const picks = ((around ?? []) as (ClientRow & { last_touch_date: string | null })[])
      .filter((c) => !already.has(c.id))
      .map((c) => ({ c, d: nearbyDistance(focusArea, c.area) }))
      .filter((x): x is { c: ClientRow & { last_touch_date: string | null }; d: number } => x.d != null)
      .slice(0, NEARBY_PER_DAY);
    for (const { c, d } of picks) {
      const last = maxDate(c.last_contact_date, c.last_meeting_date);
      all.push({
        ...base(c),
        type: "visit",
        source: "suggested",
        missCount: 0,
        reason: `${d > 0 ? `~${Math.max(1, Math.round(d))} km from ${focusArea} · ` : ""}${last ? `last contact ${daysBetween(last, today)}d ago` : "never contacted"}`,
        recommended: false,
        nearby: true,
        distanceKm: d,
        rank: -500,
      });
    }
  }

  // ---- Pre-select up to targets ------------------------------------------
  all.sort((a, b) => b.rank - a.rank);
  const caps: Record<ActivityType, number> = {
    visit: profile.target_visits,
    call: profile.target_calls,
    text: profile.target_texts,
  };
  const used: Record<ActivityType, number> = { visit: 0, call: 0, text: 0 };
  for (const s of all) {
    if (s.revive || s.nearby) continue;
    if (used[s.type] < caps[s.type]) {
      s.recommended = true;
      used[s.type] += 1;
    }
  }

  return {
    focusArea,
    areas: areas.map(({ area, count }) => ({ area, count })),
    suggestions: all.map((s) => {
      const { rank, ...rest } = s;
      void rank;
      return rest;
    }),
  };
}

function base(c: ClientRow) {
  return {
    clientId: c.id,
    company: c.company,
    contactPerson: c.contact_person,
    phone: c.phone,
    area: c.area,
    tier: c.tier,
  };
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
