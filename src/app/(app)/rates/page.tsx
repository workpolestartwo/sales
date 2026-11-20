import { getSession } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import type { Rate, RateSettings } from "@/lib/rates";
import { RatesBoard } from "@/components/rates-board";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RatesPage() {
  const { supabase, user } = await getSession();
  const [{ data: rates }, { data: settings }] = await Promise.all([
    supabase.from("rates").select("*").order("origin").order("destination").limit(2000),
    supabase.from("app_settings").select("markup_pct, rate_valid_days").eq("id", 1).maybeSingle(),
  ]);
  const s: RateSettings = {
    markup_pct: Number(settings?.markup_pct ?? 10),
    rate_valid_days: settings?.rate_valid_days ?? 7,
  };

  return (
    <>
      <PageHeader title="Rates" subtitle={`Buy rates shared by the team · quote = buy + ${s.markup_pct}%`} />
      <RatesBoard
        rates={((rates ?? []) as Rate[]).map((r) => ({ ...r, buy_rate: Number(r.buy_rate) }))}
        settings={s}
        today={todayIST()}
        userId={user.id}
      />
    </>
  );
}
