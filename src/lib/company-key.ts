/**
 * Duplicate-detection key for a company name. Must stay identical to the SQL
 * function public.normalize_company() (migration 0006), which enforces uniqueness.
 *
 *   "M/s Shree Ganesh Exports Pvt. Ltd."  -> "shreeganeshexports"
 *   "Shah & Co"                           -> "shah"
 */
const STOP = /\s(pvt|private|ltd|limited|llp|co|company|inc|corp|corporation|the|and)(?=\s)/g;

export function normalizeCompany(name: string | null | undefined): string {
  const lower = (name ?? "").toLowerCase();
  // Dots are dropped first so "L.L.P." == "LLP" and "Pvt." == "Pvt".
  const spaced = " " + lower.replace(/^\s*m\s*\/\s*s\.?\s*/, "").replace(/\./g, "").replace(/[^a-z0-9]+/g, " ") + " ";
  const key = spaced.replace(STOP, " ").replace(/\s+/g, "");
  return key || lower.replace(/[^a-z0-9]+/g, "");
}
