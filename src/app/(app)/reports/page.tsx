import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSession } from "@/lib/data";
import { addDays, formatDate, todayIST, weekRange } from "@/lib/dates";
import { getDaySummary, getWeekSummary, WORKING_DAYS } from "@/lib/reports";
import { DaySummaryCard, Stat } from "@/components/day-summary";
import { Meter, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "week" ? "week" : "day";
  const today = todayIST();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const { supabase, profile } = await getSession();

  const tabs = (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
      {(["day", "week"] as const).map((v) => (
        <Link key={v} href={`/reports?view=${v}&date=${date}`} className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold ${view === v ? "bg-surface shadow-sm" : "text-muted"}`}>
          {v === "day" ? "Daily" : "Weekly"}
        </Link>
      ))}
    </div>
  );

  if (view === "day") {
    const summary = await getDaySummary(supabase, date);
    return (
      <>
        <PageHeader title="Reports" subtitle="Plan vs actual" />
        <div className="space-y-4 p-4">
          {tabs}
          <Nav
            label={date === today ? "Today" : formatDate(date, { weekday: "short", day: "numeric", month: "short" })}
            prev={`/reports?view=day&date=${addDays(date, -1)}`}
            next={date < today ? `/reports?view=day&date=${addDays(date, 1)}` : null}
          />
          {summary.planStatus === "confirmed" && date === today && (
            <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">Today is still open. Numbers update as you log, and missed items are counted once you end the day.</p>
          )}
          <DaySummaryCard summary={summary} profile={profile} />
        </div>
      </>
    );
  }

  const { start } = weekRange(date);
  const w = await getWeekSummary(supabase, start, profile, today);
  const t = w.totals;
  return (
    <>
      <PageHeader title="Reports" subtitle="Weekly summary" />
      <div className="space-y-4 p-4">
        {tabs}
        <Nav
          label={`${formatDate(w.start)} – ${formatDate(w.end)}`}
          prev={`/reports?view=week&date=${addDays(start, -7)}`}
          next={addDays(start, 7) <= today ? `/reports?view=week&date=${addDays(start, 7)}` : null}
        />

        <section className="card space-y-4 p-4">
          <div>
            <p className="text-3xl font-bold tabular-nums">{t.completion ?? 0}%</p>
            <p className="text-xs text-muted">plan completion · {t.daysPlanned} {t.daysPlanned === 1 ? "day" : "days"} planned</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Meter label="Meetings" value={t.actual.visit} target={w.targets.visit} />
            <Meter label="Calls" value={t.actual.call} target={w.targets.call} />
            <Meter label="Texts" value={t.actual.text} target={w.targets.text} />
          </div>
          <p className="text-xs text-muted">Weekly target = daily target × {WORKING_DAYS} working days.</p>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Stat label="New clients added" value={t.newClients} />
          <Stat label="Got business" value={t.converted} />
          <Stat label="Unplanned activities" value={t.unplanned} />
          <Stat label="Follow-ups set" value={t.followUpsSet} />
        </section>

        <section className="card overflow-hidden">
          <table className="w-full text-sm tabular-nums">
            <thead className="bg-bg text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Day</th>
                <th className="px-2 py-2 text-right font-medium">Plan</th>
                <th className="px-2 py-2 text-right font-medium">Done</th>
                <th className="px-2 py-2 text-right font-medium">M</th>
                <th className="px-2 py-2 text-right font-medium">C</th>
                <th className="px-3 py-2 text-right font-medium">T</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {w.days.map((d) => {
                const p = d.planned.visit + d.planned.call + d.planned.text;
                const dn = d.done.visit + d.done.call + d.done.text;
                return (
                  <tr key={d.date}>
                    <td className="px-3 py-2.5">
                      <Link href={`/reports?view=day&date=${d.date}`} className="font-medium text-brand">{formatDate(d.date, { weekday: "short", day: "numeric" })}</Link>
                    </td>
                    <td className="px-2 py-2.5 text-right">{d.hasPlan ? p : "—"}</td>
                    <td className="px-2 py-2.5 text-right">{d.hasPlan ? `${dn}${d.completion != null ? ` (${d.completion}%)` : ""}` : "—"}</td>
                    <td className="px-2 py-2.5 text-right">{d.actual.visit}</td>
                    <td className="px-2 py-2.5 text-right">{d.actual.call}</td>
                    <td className="px-3 py-2.5 text-right">{d.actual.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-line px-3 py-2 text-[11px] text-muted">M / C / T = meetings, calls and texts actually logged.</p>
        </section>

        {w.areas.length > 0 && (
          <section className="card p-4">
            <p className="label">Areas visited</p>
            <div className="flex flex-wrap gap-2">
              {w.areas.map((a) => <span key={a.area} className="chip">{a.area} · {a.visits}</span>)}
            </div>
          </section>
        )}

        {w.oftenMissed.length > 0 && (
          <section className="card p-4">
            <p className="label">Missed more than once</p>
            <ul className="space-y-1 text-sm">
              {w.oftenMissed.map((m) => <li key={m.company} className="flex justify-between"><span className="truncate">{m.company}</span><span className="text-red-600">{m.times}×</span></li>)}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Nav({ label, prev, next }: { label: string; prev: string; next: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <Link href={prev} className="grid size-10 place-items-center rounded-full border border-line bg-surface" aria-label="Previous"><ChevronLeft size={18} /></Link>
      <span className="text-sm font-semibold">{label}</span>
      {next ? (
        <Link href={next} className="grid size-10 place-items-center rounded-full border border-line bg-surface" aria-label="Next"><ChevronRight size={18} /></Link>
      ) : (
        <span className="size-10" />
      )}
    </div>
  );
}
