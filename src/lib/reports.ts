import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./dates";
import type { ActivityType, ItemStatus, Outcome, Profile, Tier } from "./types";

type Counts = Record<ActivityType, number>;
const zero = (): Counts => ({ visit: 0, call: 0, text: 0 });

export interface DaySummary {
  date: string;
  hasPlan: boolean;
  planStatus: "draft" | "confirmed" | "closed" | null;
  autoClosed: boolean;
  focusArea: string | null;
  planned: Counts; // everything put in the plan except dropped
  done: Counts;
  missed: Counts;
  dropped: number;
  addedLater: number;
  completion: number | null; // % of planned items done
  actual: Counts; // all activities logged, planned or not
  unplanned: number;
  cold: number;
  outcomes: Partial<Record<Outcome, number>>;
  newClients: number;
  followUpsSet: number;
  fieldVisits: { area: string; met: number; newOffices: number }[];
  missedItems: { company: string; type: ActivityType; tier: Tier }[];
}

interface ItemRow { type: ActivityType; status: ItemStatus; added_after_confirm: boolean; plan_id: string; clients: { company: string; tier: Tier } | null }
interface ActRow { type: ActivityType; outcome: Outcome; plan_item_id: string | null; is_cold: boolean; follow_up_date: string | null; field_visit_id: string | null; activity_date: string; client_id: string | null }

/** IST day boundaries as timestamps, for created_at comparisons. */
function istRange(start: string, endInclusive: string) {
  return { from: `${start}T00:00:00+05:30`, to: `${addDays(endInclusive, 1)}T00:00:00+05:30` };
}

/** Fetches everything needed for one or more days in a few queries. */
async function load(supabase: SupabaseClient, start: string, end: string) {
  const r = istRange(start, end);
  const [plans, items, acts, clients, visits] = await Promise.all([
    supabase.from("day_plans").select("id, plan_date, status, auto_closed, focus_area").gte("plan_date", start).lte("plan_date", end),
    supabase
      .from("plan_items")
      .select("type, status, added_after_confirm, plan_id, clients(company, tier), day_plans!inner(plan_date)")
      .gte("day_plans.plan_date", start)
      .lte("day_plans.plan_date", end),
    supabase
      .from("activities")
      .select("type, outcome, plan_item_id, is_cold, follow_up_date, field_visit_id, activity_date, client_id")
      .gte("activity_date", start)
      .lte("activity_date", end),
    supabase.from("clients").select("created_at, source").gte("created_at", r.from).lt("created_at", r.to),
    supabase.from("field_visits").select("id, visit_date, area").gte("visit_date", start).lte("visit_date", end),
  ]);
  return {
    plans: (plans.data ?? []) as { id: string; plan_date: string; status: DaySummary["planStatus"]; auto_closed: boolean; focus_area: string | null }[],
    items: (items.data ?? []) as unknown as ItemRow[],
    acts: (acts.data ?? []) as ActRow[],
    clients: (clients.data ?? []) as { created_at: string; source: string }[],
    visits: (visits.data ?? []) as { id: string; visit_date: string; area: string }[],
  };
}

function istDate(ts: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(ts));
}

function summarise(date: string, d: Awaited<ReturnType<typeof load>>): DaySummary {
  const plan = d.plans.find((p) => p.plan_date === date) ?? null;
  const items = plan ? d.items.filter((i) => i.plan_id === plan.id) : [];
  const acts = d.acts.filter((a) => a.activity_date === date);

  const planned = zero(), done = zero(), missed = zero(), actual = zero();
  let dropped = 0, addedLater = 0;
  const missedItems: DaySummary["missedItems"] = [];
  for (const i of items) {
    if (i.status === "dropped") { dropped++; continue; }
    planned[i.type]++;
    if (i.added_after_confirm) addedLater++;
    if (i.status === "done") done[i.type]++;
    if (i.status === "missed" || i.status === "planned") {
      missed[i.type]++;
      if (i.clients) missedItems.push({ company: i.clients.company, type: i.type, tier: i.clients.tier });
    }
  }

  const outcomes: DaySummary["outcomes"] = {};
  let unplanned = 0, cold = 0, followUpsSet = 0;
  for (const a of acts) {
    actual[a.type]++;
    outcomes[a.outcome] = (outcomes[a.outcome] ?? 0) + 1;
    if (!a.plan_item_id) unplanned++;
    if (a.is_cold) cold++;
    if (a.follow_up_date) followUpsSet++;
  }

  const fieldVisits = d.visits
    .filter((v) => v.visit_date === date)
    .map((v) => {
      const va = acts.filter((a) => a.field_visit_id === v.id);
      return { area: v.area, met: va.filter((a) => !a.is_cold).length, newOffices: va.filter((a) => a.is_cold).length };
    });

  const totalPlanned = planned.visit + planned.call + planned.text;
  const totalDone = done.visit + done.call + done.text;

  return {
    date,
    hasPlan: !!plan,
    planStatus: plan?.status ?? null,
    autoClosed: plan?.auto_closed ?? false,
    focusArea: plan?.focus_area ?? null,
    planned, done, missed, dropped, addedLater,
    completion: totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : null,
    actual, unplanned, cold, outcomes,
    newClients: d.clients.filter((c) => istDate(c.created_at) === date && c.source !== "master_list").length,
    followUpsSet,
    fieldVisits,
    missedItems,
  };
}

export async function getDaySummary(supabase: SupabaseClient, date: string): Promise<DaySummary> {
  return summarise(date, await load(supabase, date, date));
}

export interface WeekSummary {
  start: string;
  end: string;
  days: DaySummary[];
  totals: { planned: Counts; done: Counts; actual: Counts; unplanned: number; newClients: number; converted: number; followUpsSet: number; completion: number | null; daysPlanned: number };
  targets: Counts; // weekly target = daily target x 6 working days
  areas: { area: string; visits: number }[];
  oftenMissed: { company: string; times: number }[];
}

export const WORKING_DAYS = 6;

export async function getWeekSummary(supabase: SupabaseClient, start: string, profile: Profile, upTo: string): Promise<WeekSummary> {
  const end = addDays(start, 6);
  const data = await load(supabase, start, end);
  const days: DaySummary[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    if (date > upTo) break;
    days.push(summarise(date, data));
  }

  const add = (k: "planned" | "done" | "actual") => days.reduce((acc, d) => ({ visit: acc.visit + d[k].visit, call: acc.call + d[k].call, text: acc.text + d[k].text }), zero());
  const planned = add("planned"), done = add("done"), actual = add("actual");
  const tp = planned.visit + planned.call + planned.text;
  const td = done.visit + done.call + done.text;

  const areaMap = new Map<string, number>();
  for (const d of days) for (const v of d.fieldVisits) areaMap.set(v.area, (areaMap.get(v.area) ?? 0) + 1);
  const missMap = new Map<string, number>();
  for (const d of days) for (const m of d.missedItems) missMap.set(m.company, (missMap.get(m.company) ?? 0) + 1);

  return {
    start, end, days,
    totals: {
      planned, done, actual,
      unplanned: days.reduce((s, d) => s + d.unplanned, 0),
      newClients: days.reduce((s, d) => s + d.newClients, 0),
      converted: days.reduce((s, d) => s + (d.outcomes.converted ?? 0), 0),
      followUpsSet: days.reduce((s, d) => s + d.followUpsSet, 0),
      completion: tp ? Math.round((td / tp) * 100) : null,
      daysPlanned: days.filter((d) => d.hasPlan).length,
    },
    targets: { visit: profile.target_visits * WORKING_DAYS, call: profile.target_calls * WORKING_DAYS, text: profile.target_texts * WORKING_DAYS },
    areas: [...areaMap].map(([area, visits]) => ({ area, visits })).sort((a, b) => b.visits - a.visits),
    oftenMissed: [...missMap].filter(([, n]) => n >= 2).map(([company, times]) => ({ company, times })).sort((a, b) => b.times - a.times),
  };
}
