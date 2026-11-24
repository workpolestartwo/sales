// Matching a "Sales Team" / "Salesperson" column in an upload to team accounts.

export interface TeamMember { id: string; full_name: string }

/** Header names that mean "which salesperson this client belongs to". */
export const REP_ALIASES = ["sales team", "sales rep", "salesperson", "sales person", "sales executive", "executive", "rep", "handled by", "assigned to", "owner", "account manager", "team"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

export function findRepColumn(headers: string[]): string | null {
  return headers.find((h) => REP_ALIASES.includes(norm(h))) ?? headers.find((h) => REP_ALIASES.some((a) => a.length > 3 && norm(h).includes(a))) ?? null;
}

/** Exact full name (any case/spacing), else a first name that matches exactly one member. */
export function matchMember(name: string, team: TeamMember[]): string | null {
  const n = norm(name);
  if (!n) return null;
  const exact = team.find((m) => norm(m.full_name) === n);
  if (exact) return exact.id;
  const first = team.filter((m) => norm(m.full_name).split(" ")[0] === n.split(" ")[0]);
  return first.length === 1 ? first[0].id : null;
}

/** Who already has a client (by duplicate key): in someone's list, or waiting for someone's approval. */
export interface Presence { company_key: string; owner_id: string; owner_name: string; kind: "client" | "request" }
