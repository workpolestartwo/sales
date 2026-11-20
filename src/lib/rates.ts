import { addDays } from "./dates";

export type ContainerType = "20GP" | "40GP" | "40HC" | "LCL";
export type Currency = "USD" | "INR" | "EUR";
export type Direction = "export" | "import";

export const CONTAINER_TYPES: ContainerType[] = ["20GP", "40GP", "40HC", "LCL"];
export const CONTAINER_LABELS: Record<ContainerType, string> = {
  "20GP": "20'",
  "40GP": "40'",
  "40HC": "40' HC",
  LCL: "Co-load (LCL)",
};
/** What one unit of the rate is. */
export const UNIT: Record<ContainerType, string> = { "20GP": "container", "40GP": "container", "40HC": "container", LCL: "CBM" };

export interface Rate {
  id: string;
  direction: Direction;
  origin: string;
  destination: string;
  container_type: ContainerType;
  buy_rate: number;
  currency: Currency;
  valid_until: string;
  source: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string;
}

export interface RateSettings {
  markup_pct: number;
  rate_valid_days: number;
}

const SYMBOL: Record<Currency, string> = { USD: "$", INR: "₹", EUR: "€" };

export function money(amount: number, currency: Currency): string {
  const n = new Intl.NumberFormat("en-IN", { maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  return `${SYMBOL[currency]}${n}`;
}

/** Suggested quote = buy + markup %, rounded up to a whole unit. */
export function suggestedQuote(buy: number, markupPct: number): number {
  return Math.ceil(buy * (1 + markupPct / 100));
}

export function profit(buy: number, quote: number) {
  const perUnit = quote - buy;
  return { perUnit, marginPct: quote > 0 ? (perUnit / quote) * 100 : 0, markupPct: buy > 0 ? (perUnit / buy) * 100 : 0 };
}

export type Validity = "valid" | "expiring" | "expired";

export function validity(validUntil: string, today: string): Validity {
  if (validUntil < today) return "expired";
  if (validUntil <= addDays(today, 1)) return "expiring";
  return "valid";
}

/** Common ports for the port pickers. Free text is still allowed. */
export const COMMON_PORTS = [
  "Nhava Sheva", "Mundra", "Chennai", "Kolkata", "Cochin", "Tuticorin", "Visakhapatnam", "Pipavav", "Hazira", "ICD Tughlakabad",
  "Jebel Ali", "Dammam", "Jeddah", "Hamad", "Sohar", "Bandar Abbas", "Karachi", "Chittagong", "Colombo",
  "Singapore", "Port Klang", "Laem Chabang", "Ho Chi Minh", "Jakarta", "Manila",
  "Shanghai", "Ningbo", "Shenzhen", "Qingdao", "Busan", "Hong Kong", "Tokyo", "Yokohama",
  "Rotterdam", "Antwerp", "Hamburg", "Felixstowe", "Le Havre", "Genoa", "Valencia", "Barcelona", "Piraeus",
  "New York", "Savannah", "Houston", "Los Angeles", "Long Beach", "Toronto", "Montreal",
  "Mombasa", "Durban", "Lagos", "Dar es Salaam", "Djibouti", "Sydney", "Melbourne",
];
