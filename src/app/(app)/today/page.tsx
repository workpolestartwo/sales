import { getClientOptions, getSession } from "@/lib/data";
import { addDays, formatDate, todayIST } from "@/lib/dates";
import { buildSuggestions } from "@/lib/suggestions";
import { getDaySummary } from "@/lib/reports";
import type { PlanItem } from "@/lib/types";
import { DayBuilder } from "@/components/day-builder";
import { PlanView } from "@/components/plan-view";
import { DaySummaryCard } from "@/components/day-summary";
import { ReopenButton } from "@/components/reopen-button";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const { supabase, profile } = await getSession();
  const today = todayIST();
  const title = formatDate(today, { weekday: "long", day: "numeric", month: "short" });

  // First visit of the day: close yesterday's plans (unfinished items become backlog) and
  // re-score clients. A no-op on later visits. Runs alongside the other lookups.
  const [, { data: plan }, options] = await Promise.all([
    supabase.rpc("start_day", { p_today: today }),
    supabase.from("day_plans").select("*").eq("plan_date", today).maybeSingle(),
    getClientOptions(),
  ]);

  if (!plan || plan.status === "draft") {
    const [result, yesterday] = await Promise.all([
      buildSuggestions(supabase, today, profile, area),
      getDaySummary(supabase, addDays(today, -1)),
    ]);
    return (
      <>
        <PageHeader title="Build your day" subtitle={title} />
        <DayBuilder key={result.focusArea ?? "none"} profile={profile} result={result} yesterday={yesterday.hasPlan ? yesterday : null} options={options} />
      </>
    );
  }

  if (plan.status === "closed") {
    const summary = await getDaySummary(supabase, today);
    return (
      <>
        <PageHeader title="Day closed" subtitle={title} />
        <div className="space-y-4 p-4">
          <DaySummaryCard summary={summary} profile={profile} />
          {summary.missedItems.length > 0 && (
            <p className="px-1 text-sm text-muted">
              {summary.missedItems.length} unfinished {summary.missedItems.length === 1 ? "item moves" : "items move"} to tomorrow&apos;s backlog.
            </p>
          )}
          <ReopenButton />
        </div>
      </>
    );
  }

  const [{ data: items }, { data: unplanned }, { data: todays }] = await Promise.all([
    supabase
      .from("plan_items")
      .select("*, clients(id, company, contact_person, phone, area, tier, address)")
      .eq("plan_id", plan.id)
      .order("created_at"),
    supabase
      .from("activities")
      .select("id, type, outcome, created_at, clients(company)")
      .eq("activity_date", today)
      .is("plan_item_id", null)
      .order("created_at", { ascending: false }),
    supabase.from("activities").select("type").eq("activity_date", today),
  ]);
  const actual = { visit: 0, call: 0, text: 0 };
  for (const a of todays ?? []) actual[a.type as keyof typeof actual]++;

  return (
    <>
      <PageHeader title="Today" subtitle={`${title}${plan.focus_area ? ` · ${plan.focus_area}` : ""}`} />
      <PlanView
        today={today}
        focusArea={plan.focus_area}
        profile={profile}
        items={(items ?? []) as PlanItem[]}
        unplanned={(unplanned ?? []) as unknown as { id: string; type: "visit" | "call" | "text"; outcome: string; clients: { company: string } | null }[]}
        actual={actual}
        options={options}
      />
    </>
  );
}
