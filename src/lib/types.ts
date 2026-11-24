export type Tier = "A" | "B" | "C";
export type ActivityType = "visit" | "call" | "text";
export type ClientStatus = "active" | "prospect" | "dormant" | "lost";
export type Outcome =
  | "interested"
  | "follow_up"
  | "not_reachable"
  | "not_interested"
  | "converted"
  | "met"
  | "new_lead";
export type PlanStatus = "draft" | "confirmed" | "closed";
export type ItemStatus = "planned" | "done" | "missed" | "dropped";

export interface Profile {
  id: string;
  full_name: string | null;
  target_visits: number;
  target_calls: number;
  target_texts: number;
  contact_every_days: number;
  focus_count: number;
  stagnant_after_days: number;
  /** "admin" sees the master list and team performance. Set in the database only. */
  role?: "member" | "admin";
  notify_enabled?: boolean;
  morning_time?: string;
  evening_time?: string;
  onboarded: boolean;
}

export interface Client {
  id: string;
  company: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  area: string | null;
  address: string | null;
  industry: string | null;
  total_shipments: number;
  first_shipment_date: string | null;
  last_shipment_date: string | null;
  last_meeting_date: string | null;
  last_contact_date: string | null;
  last_touch_date: string | null;
  next_follow_up: string | null;
  notes: string | null;
  source: "master_list" | "field" | "manual" | "assigned";
  status: ClientStatus;
  value_score: number;
  tier: Tier;
  /** Priority chosen by the salesperson; always wins over the automatic tier. */
  manual_tier: Tier | null;
  /** Approved from an assignment but no priority chosen yet (not scheduled). */
  priority_pending: boolean;
  next_due_date: string | null;
  created_at: string;
}

export interface DayPlan {
  id: string;
  plan_date: string;
  status: PlanStatus;
  focus_area: string | null;
  confirmed_at: string | null;
  closed_at: string | null;
  auto_closed: boolean;
}

export interface PlanItem {
  id: string;
  plan_id: string;
  client_id: string | null;
  type: ActivityType;
  reason: string | null;
  source: "suggested" | "backlog" | "manual";
  added_after_confirm: boolean;
  status: ItemStatus;
  clients?: Pick<Client, "id" | "company" | "contact_person" | "phone" | "area" | "tier"> & { address?: string | null } | null;
}

export interface Activity {
  id: string;
  client_id: string | null;
  type: ActivityType;
  activity_date: string;
  outcome: Outcome;
  notes: string | null;
  follow_up_date: string | null;
  is_cold: boolean;
  field_visit_id: string | null;
  plan_item_id: string | null;
  created_at: string;
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  met: "Met",
  interested: "Interested",
  follow_up: "Follow-up",
  not_reachable: "Not reachable",
  not_interested: "Not interested",
  converted: "Converted",
  new_lead: "New lead",
};

/** Outcome wording that fits the channel, e.g. a call was "Spoke", a text was "Sent". */
export function outcomeLabel(type: ActivityType, outcome: Outcome): string {
  if (outcome === "converted") return "Got business";
  if (outcome === "met") return type === "visit" ? "Met" : type === "call" ? "Spoke" : "Sent";
  if (outcome === "not_reachable") return type === "visit" ? "Not available" : type === "call" ? "No answer" : "No reply";
  return OUTCOME_LABELS[outcome];
}

export const TYPE_NAMES: Record<ActivityType, string> = {
  visit: "Meeting",
  call: "Call",
  text: "Text",
};
