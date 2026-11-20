// All "today" logic is in India time, regardless of where the server runs.
const TZ = "Asia/Kolkata";

/** YYYY-MM-DD for the current day in IST. */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
}

/** Monday..Sunday week containing `date`. */
export function weekRange(date: string): { start: string; end: string } {
  const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0 = Sun
  const start = addDays(date, dow === 0 ? -6 : 1 - dow);
  return { start, end: addDays(start, 6) };
}

export function formatDate(date: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
}

export function relativeDays(date: string | null | undefined, today: string): string {
  if (!date) return "never";
  const n = daysBetween(date, today);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 0) return `in ${-n}d`;
  return `${n}d ago`;
}
