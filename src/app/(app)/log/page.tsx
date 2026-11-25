import { getClientOptions, getSalesSession } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { LogForms } from "@/components/log-forms";
import { PageHeader } from "@/components/ui";

export default async function LogPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  await getSalesSession();
  const options = await getClientOptions();
  const areas = [...new Set(options.map((o) => o.area?.trim()).filter(Boolean) as string[])].sort();
  return (
    <>
      <PageHeader title="Log activity" subtitle="Record what you did today" />
      <LogForms options={options} areas={areas} today={todayIST()} initialTab={tab === "call" || tab === "text" ? tab : "visit"} />
    </>
  );
}
