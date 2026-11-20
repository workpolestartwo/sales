import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, type PushPayload } from "@/lib/push";
import { todayIST } from "@/lib/dates";

/**
 * Scheduled reminder sender. Call every 15 minutes with
 *   Authorization: Bearer <CRON_SECRET>
 * Sends each member (with notifications on) at most one "morning" and one "evening"
 * reminder per day, at the times they chose. A reminder is only sent within
 * 3 hours of its time, so a late scheduler run doesn't send stale reminders.
 */
export const dynamic = "force-dynamic";

const WINDOW_MIN = 180;

function nowIST() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value), m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let db: Db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server" }, { status: 500 });
  }
  const today = todayIST();
  const now = nowIST();

  const [{ data: profiles, error }, { data: allSubs }] = await Promise.all([
    db.from("profiles").select("id, morning_time, evening_time").eq("notify_enabled", true).eq("onboarded", true),
    db.from("push_subscriptions").select("id, owner_id, endpoint, p256dh, auth"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const subsByOwner = new Map<string, { id: string; endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of allSubs ?? []) subsByOwner.set(s.owner_id, [...(subsByOwner.get(s.owner_id) ?? []), s]);

  const results: { user: string; kind: string; sent: number }[] = [];

  for (const p of profiles ?? []) {
    const subs = subsByOwner.get(p.id);
    if (!subs?.length) continue;
    for (const kind of ["morning", "evening"] as const) {
      const at = minutes(kind === "morning" ? p.morning_time : p.evening_time);
      if (now < at || now > at + WINDOW_MIN) continue;

      // Claim the slot first: the primary key makes this exactly-once even if runs overlap.
      const { error: claimErr } = await db.from("notification_log").insert({ owner_id: p.id, kind, sent_on: today });
      if (claimErr) continue; // already sent today

      const payload = kind === "morning" ? await morningMessage(db, p.id, today) : await eveningMessage(db, p.id, today);
      if (!payload) continue;
      results.push({ user: p.id, kind, sent: await sendPush(db, subs, payload) });
    }
  }

  return NextResponse.json({ ok: true, at: today, sent: results.length, results });
}

type Db = ReturnType<typeof createAdminClient>;

async function morningMessage(db: Db, owner: string, today: string): Promise<PushPayload> {
  const [{ count: due }, { count: followUps }, { data: plan }] = await Promise.all([
    db.from("clients").select("id", { count: "exact", head: true }).eq("owner_id", owner).neq("status", "lost").lte("next_due_date", today),
    db.from("clients").select("id", { count: "exact", head: true }).eq("owner_id", owner).neq("status", "lost").lte("next_follow_up", today),
    db.from("day_plans").select("status").eq("owner_id", owner).eq("plan_date", today).maybeSingle(),
  ]);
  if (plan && plan.status !== "draft") {
    return { title: "Good morning ☀️", body: "Your plan for today is ready. Open it to start.", url: "/today", tag: "morning" };
  }
  const bits = [`${due ?? 0} clients due for contact`];
  if (followUps) bits.push(`${followUps} follow-up${followUps === 1 ? "" : "s"} promised`);
  return { title: "Build your day ☀️", body: `${bits.join(" · ")}. Pick who to meet, call and text.`, url: "/today", tag: "morning" };
}

async function eveningMessage(db: Db, owner: string, today: string): Promise<PushPayload | null> {
  const { data: plan } = await db.from("day_plans").select("id, status").eq("owner_id", owner).eq("plan_date", today).maybeSingle();
  if (plan?.status === "closed") return null; // already wrapped up
  if (!plan) {
    return { title: "Wrap up your day 🌙", body: "Log today's visits, calls and texts so your report is complete.", url: "/log", tag: "evening" };
  }
  const { count: open } = await db.from("plan_items").select("id", { count: "exact", head: true }).eq("plan_id", plan.id).eq("status", "planned");
  return {
    title: "Close your day 🌙",
    body: open ? `${open} planned item${open === 1 ? " is" : "s are"} still open. Log what you did, then end your day.` : "Everything planned is done. End your day to see your report.",
    url: "/today",
    tag: "evening",
  };
}
